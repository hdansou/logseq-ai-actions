import "@logseq/libs";

import type { Action } from "./action";
import { debugLog, PREVIEW_TRUNCATION_LIMIT, truncate } from "./debug-log";
import { parsePoints } from "./parse-points";
import { findPreset, PRESETS } from "./presets";
import { createOpenAIProvider, LLMProviderError } from "./provider";
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
];

interface ResolvedSettings {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
  readonly temperature: number;
  readonly timeoutMs: number;
  readonly debugLog: boolean;
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
  };
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
  let busyToastKey: string | number | null = null;
  const startedAt = Date.now();
  const settings = readSettings();

  try {
    const input = await resolveInput(action);
    if (input.uuid === null) {
      logseq.UI.showMsg(input.reason, "warning");
      return;
    }

    const msg = await logseq.UI.showMsg(`${action.title}…`, "info", { timeout: 0 });
    busyToastKey = (msg as unknown as string | number | null) ?? null;

    // Only include apiKey when non-empty — `exactOptionalPropertyTypes`
    // disallows passing `undefined` to an optional field.
    const output = await provider.complete({
      baseUrl: settings.baseUrl,
      model: settings.model,
      system: action.systemPrompt,
      user: input.llmInput,
      temperature: settings.temperature,
      timeoutMs: settings.timeoutMs,
      ...(settings.apiKey ? { apiKey: settings.apiKey } : {}),
    });

    if (busyToastKey !== null) {
      try {
        logseq.UI.closeMsg(busyToastKey as string);
      } catch {
        /* swallow — closeMsg throws on unknown key */
      }
      busyToastKey = null;
    }

    if (settings.debugLog) {
      debugLog.push({
        timestamp: startedAt,
        actionId: action.id,
        actionTitle: action.title,
        scope: action.scope,
        outputMode: action.outputMode,
        model: settings.model,
        baseUrl: settings.baseUrl,
        requestPreview: truncate(input.llmInput, PREVIEW_TRUNCATION_LIMIT),
        responsePreview: truncate(output, PREVIEW_TRUNCATION_LIMIT),
        durationMs: Date.now() - startedAt,
      });
    }

    if (!output) {
      logseq.UI.showMsg(`${action.title}: empty response from model`, "warning");
      return;
    }

    if (action.outputMode === "diff-panel") {
      const accepted = await showDiffPanel(action.title, input.displayOriginal, output);
      if (accepted === null) {
        logseq.UI.showMsg(`${action.title} discarded`, "info");
        return;
      }
      await logseq.Editor.updateBlock(input.uuid, accepted);
      logseq.UI.showMsg(`${action.title} applied`, "success");
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

    if (settings.debugLog) {
      debugLog.push({
        timestamp: startedAt,
        actionId: action.id,
        actionTitle: action.title,
        scope: action.scope,
        outputMode: action.outputMode,
        model: settings.model,
        baseUrl: settings.baseUrl,
        // No reliable input capture here — resolveInput may have thrown
        // before we had it. Use a marker so it's obvious in the viewer.
        requestPreview: "<not captured>",
        durationMs: Date.now() - startedAt,
        error: detail,
      });
    }

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
    } catch (err) {
      console.error("logseq-ai-actions: preset change handler failed", err);
    }
  });

  for (const action of SEED_ACTIONS) {
    logseq.Editor.registerSlashCommand(slashLabelFor(action), async () => {
      await runAction(action);
    });
  }

  logseq.Editor.registerSlashCommand("AI Diagnostics", async () => {
    await showDiagnostics();
  });

  console.info(`logseq-ai-actions: ready — registered ${SEED_ACTIONS.length + 1} slash commands`);
}

logseq.ready(main).catch((err) => {
  console.error("logseq-ai-actions: failed to start", err);
});
