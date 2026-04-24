import "@logseq/libs";

import type { Action } from "./action";
import { debugLog, PREVIEW_TRUNCATION_LIMIT, truncate } from "./debug-log";
import { classifyEndpoint } from "./endpoint";
import { parsePoints } from "./parse-points";
import { findPreset, PRESETS } from "./presets";
import { createOpenAIProvider, LLMProviderError } from "./provider";
import { buildRegistry } from "./registry";
import { SEED_ACTIONS } from "./seed-actions";
import { type BlockNode, flattenSubtree } from "./subtree";
import { showConfirm } from "./ui/show-confirm";
import { showDiagnostics } from "./ui/show-diagnostics";
import { showDiffPanel } from "./ui/show-diff";

// Plugin entry point. Keep this module SHALLOW — it is the only place that
// loads `@logseq/libs` for its side-effects. Every other module uses a
// triple-slash `/// <reference types="@logseq/libs" />` so Vitest can import
// them without crashing on the SDK's browser-only bootstrap (runtime-gotchas
// §11). Business logic lives in `src/**` pure modules and the
// `src/adapter/` Logseq wrapper (REQUIREMENTS §9).

type SettingDesc = Parameters<typeof logseq.useSettingsSchema>[0][number];

const PRIMARY_DEFAULT = findPreset("lm-studio");

const SETTINGS_SCHEMA: SettingDesc[] = [
  {
    key: "preset",
    type: "enum",
    enumChoices: PRESETS.map((p) => p.id),
    enumPicker: "select",
    default: "lm-studio",
    title: "Endpoint preset",
    description:
      "Pick your local LLM server. Changing this auto-fills Base URL and Model below — unless you've overridden them.",
  },
  {
    key: "baseUrl",
    type: "string",
    default: PRIMARY_DEFAULT?.baseUrl ?? "http://localhost:1234/v1",
    title: "Base URL",
    description:
      "OpenAI-compatible endpoint. A non-loopback URL will be labeled REMOTE and trigger a one-time warning.",
  },
  {
    key: "model",
    type: "string",
    default: PRIMARY_DEFAULT?.defaultModel ?? "local-model",
    title: "Model",
    description:
      "Model identifier as your endpoint names it (e.g. `gemma3:4b` for Ollama, the loaded model id for LM Studio).",
  },
  {
    key: "apiKey",
    type: "string",
    default: "",
    title: "API key (optional)",
    description:
      "Required only for endpoints with auth. LM Studio and Ollama ignore this. Stored in plugin settings — treat accordingly.",
    inputAs: "textarea",
  },
  {
    key: "temperature",
    type: "number",
    default: 0.3,
    title: "Temperature",
    description:
      "0 = deterministic, 1 = balanced, 2 = creative. Default 0.3 for accurate rewrites.",
  },
  {
    key: "timeoutMs",
    type: "number",
    default: 60000,
    title: "Request timeout (ms)",
    description: "Abort the request after this many milliseconds. Default 60 s.",
  },
  {
    key: "debugLog",
    type: "boolean",
    default: false,
    title: "Enable debug log",
    description:
      "Keep an in-memory ring buffer of the last 50 requests, viewable in the plugin diagnostics panel. Never written to disk.",
  },
  {
    key: "userActionsJson",
    type: "string",
    inputAs: "textarea",
    default: "",
    title: "User-defined actions (JSON)",
    description:
      "A JSON array of custom actions. Each entry: { id, title, scope (block/subtree/selection), outputMode (replace/diff-panel/append-children), systemPrompt, description? }. Matching a built-in id SHADOWS it. Editing an existing entry's prompt/title hot-reloads; adding or removing an entry needs a plugin toggle to update slash commands. See README.",
  },
];

interface ResolvedSettings {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
  readonly temperature: number;
  readonly timeoutMs: number;
  readonly debugLog: boolean;
  readonly userActionsJson: string;
}

/**
 * Read settings through the getter every time — per runtime-gotchas §7,
 * `logseq.settings` is a property getter that returns a snapshot; a
 * captured local copy goes stale after `updateSettings`.
 */
function readSettings(): ResolvedSettings {
  const s = (logseq.settings ?? {}) as Record<string, unknown>;
  const fallback = PRIMARY_DEFAULT;
  return {
    baseUrl: String(s.baseUrl ?? fallback?.baseUrl ?? "http://localhost:1234/v1"),
    model: String(s.model ?? fallback?.defaultModel ?? "local-model"),
    apiKey: String(s.apiKey ?? ""),
    temperature: Number(s.temperature ?? 0.3),
    timeoutMs: Number(s.timeoutMs ?? 60_000),
    debugLog: Boolean(s.debugLog ?? false),
    userActionsJson: String(s.userActionsJson ?? ""),
  };
}

/**
 * Active action registry — built-ins merged with user-defined actions
 * from `userActionsJson`. Rebuilt at startup and whenever the setting
 * changes. Slash-command handlers resolve their action by `id` against
 * this list at INVOCATION time, so editing a user action's prompt /
 * title hot-reloads without a plugin restart. Adding or removing an
 * action still requires a plugin toggle because Logseq doesn't expose
 * a slash-command deregister API.
 */
let activeActions: readonly Action[] = SEED_ACTIONS;
const registeredInvocationIds = new Set<string>();

function rebuildRegistry(showToastOnError: boolean): void {
  const { userActionsJson } = readSettings();
  const result = buildRegistry(SEED_ACTIONS, userActionsJson);
  activeActions = result.actions;
  if (result.errors.length > 0) {
    console.warn("logseq-ai-actions: user actions validation errors", result.errors);
    if (showToastOnError) {
      logseq.UI.showMsg(
        `AI Actions: ${result.errors.length} user action${result.errors.length === 1 ? "" : "s"} skipped — see console or /AI Diagnostics for details`,
        "warning",
        { timeout: 6000 },
      );
    }
  }

  // Register both the slash command and the command-palette entry for
  // each action id we haven't seen before. Logseq has no deregister API
  // for either, so actions removed from the user JSON still have live
  // menu entries; invoking one warns at runtime when the lookup fails.
  for (const action of activeActions) {
    if (registeredInvocationIds.has(action.id)) continue;
    registeredInvocationIds.add(action.id);
    const handler = async () => {
      const fresh = activeActions.find((a) => a.id === action.id);
      if (!fresh) {
        logseq.UI.showMsg(
          `Action '${action.id}' is no longer available — reload the plugin to refresh the menus`,
          "warning",
        );
        return;
      }
      await runAction(fresh);
    };
    logseq.Editor.registerSlashCommand(slashLabelFor(action), handler);
    logseq.App.registerCommandPalette(
      { key: `logseq-ai-actions/${action.id}`, label: `AI: ${action.title}` },
      handler,
    );
  }
}

/**
 * When the user picks a different preset, auto-fill `baseUrl` and `model`
 * from that preset — but only if the user hasn't customised the current
 * values (i.e., they still match the *previous* preset's defaults or are
 * empty). This avoids clobbering a custom URL the user typed in.
 */
function handlePresetChange(
  newSettings: Record<string, unknown>,
  oldSettings: Record<string, unknown>,
): void {
  const newPresetId = String(newSettings.preset ?? "");
  const oldPresetId = String(oldSettings.preset ?? "");
  if (newPresetId === oldPresetId) return;

  const newPreset = findPreset(newPresetId);
  if (!newPreset || newPreset.id === "custom") return;

  const oldPreset = findPreset(oldPresetId);
  const currentBase = String(oldSettings.baseUrl ?? "");
  const currentModel = String(oldSettings.model ?? "");

  const updates: Record<string, string> = {};
  if (!currentBase || currentBase === (oldPreset?.baseUrl ?? "")) {
    updates.baseUrl = newPreset.baseUrl;
  }
  if (!currentModel || currentModel === (oldPreset?.defaultModel ?? "")) {
    updates.model = newPreset.defaultModel;
  }
  if (Object.keys(updates).length > 0) {
    logseq.updateSettings(updates);
  }
}

/**
 * Probe whether the plugin iframe can reach its parent frame — i.e.
 * whether we're in Logseq Desktop (same-origin, host-scope reachable)
 * or Logseq Web (cross-origin, `logseq.Request._request` will fail
 * inside the SDK and emit a noisy "Can not access host scope!" error
 * before we can catch it).
 *
 * Accessing `window.parent.document` on a cross-origin frame throws
 * `SecurityError` synchronously. Wrapping in try/catch suppresses the
 * throw without emitting to the console. Cached on first call — one
 * property access per session, zero noise on subsequent requests.
 */
let hostScopeReachable: boolean | null = null;

function isHostScopeReachable(): boolean {
  if (hostScopeReachable !== null) return hostScopeReachable;
  try {
    void window.parent.document;
    hostScopeReachable = true;
  } catch {
    hostScopeReachable = false;
  }
  return hostScopeReachable;
}

/**
 * Fetch shim that tries to route HTTP through Logseq's own `logseq.Request`
 * helper (Electron desktop only — uses Electron's `net` module, bypassing
 * browser CORS). On anything going wrong — API missing, host scope
 * unreachable, unexpected shape — fall back to `globalThis.fetch` so
 * behaviour is never worse than the current direct-fetch path.
 *
 * `logseq.Request` is an underscore-prefixed SDK internal; its return
 * shape isn't fully characterised by the public typings. We handle both
 * "returns body directly" and "returns { data: body }" to be safe.
 */
async function logseqFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // Short-circuit on web Logseq — `logseq.Request._request` would try to
  // reach the host iframe for us, hit the same-origin wall, and log
  // `Can not access host scope!` via its own console.error before we
  // could catch it. Probe ourselves (silently) and skip the SDK call.
  if (!isHostScopeReachable()) {
    return globalThis.fetch(input, init);
  }

  const url = typeof input === "string" ? input : input.toString();
  const req = (logseq as { Request?: { _request?: (opts: unknown) => Promise<unknown> } }).Request;
  if (!req?._request) {
    return globalThis.fetch(input, init);
  }
  try {
    const method = init?.method ?? "GET";
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const data = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
    const result = await req._request({ url, method, headers, data });
    const body = (result as { data?: unknown })?.data ?? result;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.warn("logseq-ai-actions: logseq.Request failed, falling back to fetch", err);
    return globalThis.fetch(input, init);
  }
}

const provider = createOpenAIProvider({ fetchImpl: logseqFetch });

/**
 * Build the provider request body shared by both complete + stream.
 * Pulled out so the debug-log truncation in performLLM* stays in sync
 * with the actual request.
 */
function buildProviderRequest(action: Action, input: ResolvedInput, settings: ResolvedSettings) {
  return {
    baseUrl: settings.baseUrl,
    model: settings.model,
    system: action.systemPrompt,
    user: input.llmInput,
    temperature: settings.temperature,
    timeoutMs: settings.timeoutMs,
    ...(settings.apiKey ? { apiKey: settings.apiKey } : {}),
  };
}

function recordDebugEntry(
  action: Action,
  input: ResolvedInput,
  settings: ResolvedSettings,
  startedAt: number,
  output: string | undefined,
  error: string | undefined,
): void {
  if (!settings.debugLog) return;
  debugLog.push({
    timestamp: startedAt,
    actionId: action.id,
    actionTitle: action.title,
    scope: action.scope,
    outputMode: action.outputMode,
    model: settings.model,
    baseUrl: settings.baseUrl,
    requestPreview: truncate(input.llmInput, PREVIEW_TRUNCATION_LIMIT),
    durationMs: Date.now() - startedAt,
    ...(output !== undefined
      ? { responsePreview: truncate(output, PREVIEW_TRUNCATION_LIMIT) }
      : {}),
    ...(error !== undefined ? { error } : {}),
  });
}

/**
 * Run a single LLM call for an already-resolved action + input, and
 * record a debug-log entry (when enabled). Shared by the initial
 * `runAction` path and the action-bar re-run path so both produce
 * identical log entries and there's one place to change the request
 * shape.
 */
async function performLLMCall(
  action: Action,
  input: ResolvedInput,
  settings: ResolvedSettings,
): Promise<string> {
  const startedAt = Date.now();
  let output: string | undefined;
  let error: string | undefined;
  try {
    output = await provider.complete(buildProviderRequest(action, input, settings));
    return output;
  } catch (err) {
    error =
      err instanceof LLMProviderError
        ? `${err.message}${err.details?.status ? ` (HTTP ${err.details.status})` : ""}`
        : (err as Error).message;
    throw err;
  } finally {
    recordDebugEntry(action, input, settings, startedAt, output, error);
  }
}

/**
 * Streaming sibling of `performLLMCall`. `onChunk` fires per delta.
 * Records the same debug-log shape as the non-streaming path.
 */
async function performLLMStream(
  action: Action,
  input: ResolvedInput,
  settings: ResolvedSettings,
  onChunk: (chunk: string) => void,
): Promise<string> {
  const startedAt = Date.now();
  let output: string | undefined;
  let error: string | undefined;
  try {
    output = await provider.stream(buildProviderRequest(action, input, settings), onChunk);
    return output;
  } catch (err) {
    error =
      err instanceof LLMProviderError
        ? `${err.message}${err.details?.status ? ` (HTTP ${err.details.status})` : ""}`
        : (err as Error).message;
    throw err;
  } finally {
    recordDebugEntry(action, input, settings, startedAt, output, error);
  }
}

interface ResolvedInput {
  readonly uuid: string;
  /** Text sent to the LLM (may be a flattened outline for subtree scope). */
  readonly llmInput: string;
  /** Text displayed as "Original" in the diff panel — the content being replaced. */
  readonly displayOriginal: string;
}

type ResolveResult = ResolvedInput | { readonly uuid: null; readonly reason: string };

/**
 * Resolve the LLM input for an action from the block the cursor is in.
 *   - `block`: both LLM input and diff "original" are the block's own text.
 *   - `subtree`: LLM input is the flattened outline; diff "original" stays
 *     the parent block's own text (what actually gets replaced). Otherwise
 *     the diff view shows "outline → summary" which lights up every word
 *     as "changed" and is misleading.
 *   - `selection`: treated as `block` until the selection-range adapter
 *     lands.
 */
async function resolveInput(action: Action): Promise<ResolveResult> {
  const current = await logseq.Editor.getCurrentBlock();
  if (!current?.uuid) return { uuid: null, reason: "Place your cursor inside a block first." };

  const currentText = String(
    (current as unknown as { title?: string; content?: string }).title ??
      (current as unknown as { content?: string }).content ??
      "",
  ).trim();

  if (action.scope === "subtree") {
    const full = (await logseq.Editor.getBlock(current.uuid, {
      includeChildren: true,
    })) as unknown as BlockNode & { uuid: string };
    const outline = flattenSubtree(full).trim();
    if (!outline || outline === "-") {
      return { uuid: null, reason: "This block and its children have no text to process." };
    }
    return { uuid: current.uuid, llmInput: outline, displayOriginal: currentText };
  }

  if (!currentText) return { uuid: null, reason: "This block has no text to process." };
  return { uuid: current.uuid, llmInput: currentText, displayOriginal: currentText };
}

/**
 * Run a single seed action against the block the cursor is currently in.
 * MVP behaviour: `replace` mode for all four seed actions (summarize now
 * uses subtree scope — writes the summary into the parent block, leaves
 * children as supporting detail). Future work (Phase 5): `diff-panel`
 * output mode and `selection` scope.
 */
async function runAction(action: Action): Promise<void> {
  const settings = readSettings();

  const input = await resolveInput(action);
  if (input.uuid === null) {
    logseq.UI.showMsg(input.reason, "warning");
    return;
  }

  // Diff-panel mode: the panel IS the busy indicator. Mount it
  // immediately with an empty Proposed column; the panel invokes the
  // streaming callback on mount, which fills in the content token by
  // token. No pre-flight LLM call, no busy toast.
  if (action.outputMode === "diff-panel") {
    const panelActions = activeActions
      .filter((a) => a.outputMode === "diff-panel")
      .map((a) => ({ id: a.id, title: a.title }));

    const runAndStream = async (
      actionId: string,
      onChunk: (chunk: string) => void,
    ): Promise<{ finalText: string; actionTitle: string }> => {
      const a = activeActions.find((x) => x.id === actionId);
      if (!a) throw new Error(`Unknown action: ${actionId}`);
      const inp = await resolveInput(a);
      if (inp.uuid === null) throw new Error(inp.reason);
      // Read settings fresh — user may have changed preset/model
      // between the initial invocation and a re-run (runtime-gotchas §7).
      const s = readSettings();
      const text = await performLLMStream(a, inp, s, onChunk);
      return { finalText: text, actionTitle: a.title };
    };

    const accepted = await showDiffPanel({
      currentActionId: action.id,
      actionTitle: action.title,
      baseUrl: settings.baseUrl,
      original: input.displayOriginal,
      actions: panelActions,
      runAndStream,
    });
    if (accepted === null) {
      logseq.UI.showMsg(`${action.title} discarded`, "info");
      return;
    }
    await logseq.Editor.updateBlock(input.uuid, accepted);
    logseq.UI.showMsg(`${action.title} applied`, "success");
    return;
  }

  // Non-streaming paths: replace + append-children share the
  // busy-toast + one-shot `complete()` flow.
  let busyToastKey: string | number | null = null;
  try {
    const msg = await logseq.UI.showMsg(`${action.title}…`, "info", { timeout: 0 });
    busyToastKey = (msg as unknown as string | number | null) ?? null;

    const output = await performLLMCall(action, input, settings);

    if (busyToastKey !== null) {
      try {
        logseq.UI.closeMsg(busyToastKey as string);
      } catch {
        /* swallow — closeMsg throws on unknown key */
      }
      busyToastKey = null;
    }

    if (!output) {
      logseq.UI.showMsg(`${action.title}: empty response from model`, "warning");
      return;
    }

    if (action.outputMode === "append-children") {
      const points = parsePoints(output);
      if (points.length === 0) {
        logseq.UI.showMsg(`${action.title}: no points extracted`, "warning");
        return;
      }
      const preview = points.map((p) => `• ${p}`).join("\n");
      const accepted = await showConfirm(action.title, {
        message: `Add ${points.length} new child block${points.length === 1 ? "" : "s"} under the current block?`,
        preview,
        acceptLabel: "Add as children",
        baseUrl: settings.baseUrl,
      });
      if (!accepted) {
        logseq.UI.showMsg(`${action.title} discarded`, "info");
        return;
      }
      for (const point of points) {
        // Ordered sequential inserts preserve top-down order. `sibling:
        // false` attaches under the current block rather than as a
        // sibling.
        await logseq.Editor.insertBlock(input.uuid, point, { sibling: false });
      }
      logseq.UI.showMsg(
        `${action.title}: added ${points.length} child block${points.length === 1 ? "" : "s"}`,
        "success",
      );
      return;
    }

    // outputMode === "replace"
    await logseq.Editor.updateBlock(input.uuid, output);
    logseq.UI.showMsg(`${action.title} applied`, "success");
  } catch (err) {
    if (busyToastKey !== null) {
      try {
        logseq.UI.closeMsg(busyToastKey as string);
      } catch {
        /* ignore */
      }
    }
    const detail =
      err instanceof LLMProviderError
        ? `${err.message}${err.details?.status ? ` (HTTP ${err.details.status})` : ""}`
        : (err as Error).message;
    console.error(`logseq-ai-actions: ${action.id} failed`, err);
    // performLLMCall records its own debug-log entry in a finally block;
    // we don't duplicate here. Errors thrown before the LLM call (e.g.
    // from resolveInput) go unlogged — they're UI/setup issues, not
    // model failures, and the toast is enough signal.
    logseq.UI.showMsg(`${action.title} failed: ${detail}`, "error");
  }
}

function slashLabelFor(action: Action): string {
  // Menu display name users see when typing `/`. Prefix with "AI " so
  // typing `/ai` surfaces all four.
  return `AI ${action.title}`;
}

async function main(): Promise<void> {
  logseq.useSettingsSchema(SETTINGS_SCHEMA);

  logseq.onSettingsChanged((newSettings, oldSettings) => {
    try {
      handlePresetChange(
        newSettings as Record<string, unknown>,
        oldSettings as Record<string, unknown>,
      );
      const prev = String((oldSettings as Record<string, unknown>).userActionsJson ?? "");
      const next = String((newSettings as Record<string, unknown>).userActionsJson ?? "");
      if (prev !== next) rebuildRegistry(true);

      // Detect a LOCAL → REMOTE endpoint transition and warn once per flip.
      const nextBaseUrl = String((newSettings as Record<string, unknown>).baseUrl ?? "");
      const newTrust = classifyEndpoint(nextBaseUrl);
      const lastTrust = readPrivateSetting("_lastEndpointTrust", "local");
      if (lastTrust === "local" && newTrust === "remote") {
        void showRemoteTransitionNotice(nextBaseUrl);
      }
      if (lastTrust !== newTrust) {
        logseq.updateSettings({ _lastEndpointTrust: newTrust });
      }
    } catch (err) {
      console.error("logseq-ai-actions: settings-change handler failed", err);
    }
  });

  // Initial registry build — also registers slash commands for every
  // built-in + user action in one pass.
  rebuildRegistry(true);

  const diagnosticsHandler = async () => {
    await showDiagnostics();
  };
  logseq.Editor.registerSlashCommand("AI Diagnostics", diagnosticsHandler);
  logseq.App.registerCommandPalette(
    { key: "logseq-ai-actions/diagnostics", label: "AI: Diagnostics" },
    diagnosticsHandler,
  );

  console.info(
    `logseq-ai-actions: ready — ${activeActions.length} action${activeActions.length === 1 ? "" : "s"} registered (${activeActions.length - SEED_ACTIONS.length >= 0 ? activeActions.length - SEED_ACTIONS.length : 0} user-defined)`,
  );

  // Fire-and-forget: first-run consent + initial trust record. Don't
  // await in main() — logseq.ready's handshake depends on main's
  // promise resolving promptly, and the consent modal is user-paced.
  void runFirstRunFlow();
}

/**
 * Read a private (underscore-prefixed) plugin-settings key directly via
 * the `logseq.settings` getter. These keys are kept OUT of
 * `SETTINGS_SCHEMA` so they don't render in the visible settings UI —
 * they're plugin-internal persistence, not user configuration.
 */
function readPrivateSetting<T extends string>(key: string, fallback: T): string {
  const s = (logseq.settings ?? {}) as Record<string, unknown>;
  const v = s[key];
  return typeof v === "string" ? v : fallback;
}

async function runFirstRunFlow(): Promise<void> {
  const settings = (logseq.settings ?? {}) as Record<string, unknown>;
  const consentSeen = Boolean(settings._consentSeen);
  const baseUrl = readSettings().baseUrl;

  if (!consentSeen) {
    await showConfirm("AI Actions — welcome", {
      message:
        "When you invoke an AI action (like /AI Rewrite or /AI Summarize), the content of your current block is sent to the configured endpoint. By default that's a server running on your own machine. You can change the endpoint in plugin settings — any non-loopback host will be clearly marked REMOTE and trigger a one-time warning.",
      acceptLabel: "Got it",
      hideReject: true,
      baseUrl,
    });
    logseq.updateSettings({ _consentSeen: true });
  }

  // Seed the last-trust marker so the very first baseUrl change after
  // plugin install correctly detects a transition (rather than assuming
  // everyone started LOCAL).
  const currentTrust = classifyEndpoint(baseUrl);
  const existing = readPrivateSetting("_lastEndpointTrust", "");
  if (existing !== currentTrust) {
    logseq.updateSettings({ _lastEndpointTrust: currentTrust });
  }
}

async function showRemoteTransitionNotice(baseUrl: string): Promise<void> {
  await showConfirm("Endpoint changed to REMOTE", {
    message: `Your endpoint is now a non-loopback address. AI actions you run will send block content to this host instead of your own machine. If this is what you intended, carry on. If not, change the Base URL back in plugin settings.`,
    acceptLabel: "I understand",
    hideReject: true,
    baseUrl,
  });
}

logseq.ready(main).catch((err) => {
  console.error("logseq-ai-actions: failed to start", err);
});
