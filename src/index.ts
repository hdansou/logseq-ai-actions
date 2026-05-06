import "@logseq/libs";

import type { Action } from "./action";
import { runFirstRunFlow, showRemoteTransitionNotice } from "./adapter/consent";
import {
  getCachedEditingBlockUuid,
  probeFocusedBlockNow,
  startEditingBlockTracker,
} from "./adapter/editing-block-cache";
import { logseqFetch } from "./adapter/host-scope";
import { type RunActionContext, runAction } from "./adapter/run-action";
import { handlePresetChange, readPrivateSetting, readSettings } from "./adapter/settings";
import { startThemeSync } from "./adapter/theme-sync";
import { classifyEndpoint } from "./endpoint";
import { findPreset, PRESETS } from "./presets";
import { createOpenAIProvider } from "./provider";
import { buildRegistry, parseUserActions } from "./registry";
import { SEED_ACTIONS } from "./seed-actions";
import { showActionPicker } from "./ui/show-action-picker";
import { showDiagnostics } from "./ui/show-diagnostics";
import { showManageActions } from "./ui/show-manage-actions";
import { filterHiddenActions } from "./visibility";

// Plugin entry point. Keep this module SHALLOW — it is the only place
// that loads `@logseq/libs` for its side-effects. Every Logseq-touching
// helper is in `src/adapter/`, which uses `/// <reference types="@logseq/libs" />`
// for types only so Vitest can import them without crashing on the SDK's
// browser-only bootstrap (runtime-gotchas §11). Pure modules
// (registry, scope resolver, endpoint classifier, diff, streaming
// parser) stay outside both layers (REQUIREMENTS §9).

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
    key: "visionModel",
    type: "string",
    default: "",
    title: "Vision model (optional)",
    description:
      "Model identifier used for vision actions (e.g. Generate Title on an image block). Leave empty to reuse the Model setting above — fine if you're running a unified multimodal model like `qwen3.5:2b`. Set this when your text model is text-only and you want a separate vision model alongside.",
  },
  {
    key: "apiKey",
    type: "string",
    default: "",
    title: "API key (optional)",
    description:
      "Required only for endpoints with auth. LM Studio and Ollama ignore this. Stored UNENCRYPTED in Logseq's plugin settings file on disk — do not paste a credential you wouldn't store in plain text.",
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
      "A JSON array of custom actions. Each entry: { id, title, scope (block/subtree/selection), outputMode (replace/diff-panel/append-children/outline-replace/outline-append/picker-replace), systemPrompt, kind? (text|vision, default text), description? }. Matching a built-in id SHADOWS it. Editing an existing entry's prompt/title hot-reloads; adding or removing an entry needs a plugin toggle to update slash commands. See README.",
  },
];

const provider = createOpenAIProvider({ fetchImpl: logseqFetch });

/**
 * Active action registry — built-ins merged with user-defined actions
 * from `userActionsJson`. Rebuilt at startup and whenever the setting
 * changes. Slash-command handlers resolve their action by `id` against
 * this list at INVOCATION time, so editing a user action's prompt /
 * title hot-reloads without a plugin restart. Adding or removing an
 * action still requires a plugin toggle because Logseq doesn't expose
 * a slash-command deregister API.
 *
 * Two parallel views (REQUIREMENTS §16):
 * - `activeActions` is the merged registry MINUS the user's hidden ids.
 *   It powers user-facing surfaces that re-read on each render
 *   (toolbar picker, diff-panel re-run options).
 * - `activeActionsAll` is the unfiltered merged registry. It powers
 *   handler `find()` lookups so stale slash / palette / context-menu
 *   entries for hidden actions still execute correctly until the next
 *   plugin reload (Logseq has no deregister API). It also feeds the
 *   Manage Actions panel so users can see and restore hidden entries.
 */
let activeActions: readonly Action[] = SEED_ACTIONS;
let activeActionsAll: readonly Action[] = SEED_ACTIONS;
const registeredInvocationIds = new Set<string>();

const runActionCtx: RunActionContext = {
  provider,
  // Diff-panel "Re-run with another action" dropdowns surface choices
  // to the user — they should respect hidden state, so use the
  // filtered list here.
  getActiveActions: () => activeActions,
};

function rebuildRegistry(showToastOnError: boolean): void {
  const { userActionsJson, hiddenActionIds } = readSettings();
  const result = buildRegistry(SEED_ACTIONS, userActionsJson);
  activeActionsAll = result.actions;
  activeActions = filterHiddenActions(result.actions, hiddenActionIds);
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

  // Register slash command + command-palette entry + block context-menu
  // item for each action id we haven't seen before. Logseq has no
  // deregister API for any of these, so we iterate the UNFILTERED
  // registry — hidden actions still get their handlers attached at
  // startup, and stale entries that survive a hide/un-hide cycle in
  // a single session keep working. Actions that are hidden after
  // registration still respond to slash / palette / context-menu
  // invocations until plugin reload (REQUIREMENTS §16; same caveat as
  // user-action add/remove).
  for (const action of activeActionsAll) {
    if (registeredInvocationIds.has(action.id)) continue;
    registeredInvocationIds.add(action.id);
    const handler = async () => {
      const fresh = activeActionsAll.find((a) => a.id === action.id);
      if (!fresh) {
        logseq.UI.showMsg(
          `Action '${action.id}' is no longer available — reload the plugin to refresh the menus`,
          "warning",
        );
        return;
      }
      await runAction(fresh, runActionCtx);
    };
    logseq.Editor.registerSlashCommand(slashLabelFor(action), handler);
    logseq.App.registerCommandPalette(
      { key: `logseq-ai-actions/${action.id}`, label: `AI: ${action.title}` },
      handler,
    );
    // Block context-menu entry: handler receives the clicked block's
    // uuid, which we pass to runAction so the action runs on that
    // specific block rather than wherever the cursor happens to be.
    logseq.Editor.registerBlockContextMenuItem(`AI: ${action.title}`, async (e) => {
      const fresh = activeActionsAll.find((a) => a.id === action.id);
      if (!fresh) {
        logseq.UI.showMsg(
          `Action '${action.id}' is no longer available — reload the plugin to refresh the menus`,
          "warning",
        );
        return;
      }
      await runAction(fresh, runActionCtx, e.uuid);
    });
  }
}

function slashLabelFor(action: Action): string {
  // Menu display name users see when typing `/`. Prefix with "AI " so
  // typing `/ai` surfaces all four.
  return `AI ${action.title}`;
}

async function openManagePanel(): Promise<void> {
  const settings = readSettings();
  const { userActions } = parseUserActions(settings.userActionsJson);
  await showManageActions({
    builtin: SEED_ACTIONS,
    initialUserActions: userActions,
    onSave: async (next) => {
      // Serialise with 2-space indent so the hand-editable textarea stays
      // human-readable for power users round-tripping the JSON.
      const json = JSON.stringify(next, null, 2);
      logseq.updateSettings({ userActionsJson: json });
      // onSettingsChanged fires rebuildRegistry — the new actions are
      // live after this returns.
    },
    initialHiddenActionIds: settings.hiddenActionIds,
    onSaveVisibility: async (next) => {
      // Cast to a mutable array — Logseq's settings store accepts any
      // JSON value but the type signature wants a plain object.
      logseq.updateSettings({ hiddenActionIds: [...next] });
    },
  });
}

async function openActionPicker(): Promise<void> {
  // Capture the focused block BEFORE mounting the picker. The toolbar
  // click itself blurs the editor (Logseq dismisses edit state on any
  // click outside the editor area), so a sync probe at this point will
  // usually return null. Fall back to the polling cache populated by
  // `startEditingBlockTracker`, which captured the UUID up to ~500 ms
  // before the click. Threaded into the panel (drives the empty state)
  // and into `runAction`'s `explicitBlockUuid` so the chosen action
  // operates on the right block.
  const live = await probeFocusedBlockNow();
  const targetBlockUuid = live ?? getCachedEditingBlockUuid();
  const result = await showActionPicker({
    actions: activeActions,
    builtinCount: SEED_ACTIONS.length,
    targetBlockUuid,
  });
  if (result.kind === "action") {
    await runAction(result.action, runActionCtx, targetBlockUuid ?? undefined);
  } else if (result.kind === "manage") {
    await openManagePanel();
  } else if (result.kind === "diagnostics") {
    await showDiagnostics();
  }
}

function registerAllInvocations(): void {
  rebuildRegistry(true);

  const diagnosticsHandler = async () => {
    await showDiagnostics();
  };
  logseq.Editor.registerSlashCommand("AI Diagnostics", diagnosticsHandler);
  logseq.App.registerCommandPalette(
    { key: "logseq-ai-actions/diagnostics", label: "AI: Diagnostics" },
    diagnosticsHandler,
  );

  const manageHandler = async () => {
    await openManagePanel();
  };
  logseq.Editor.registerSlashCommand("AI Manage Actions", manageHandler);
  logseq.App.registerCommandPalette(
    { key: "logseq-ai-actions/manage", label: "AI: Manage Actions" },
    manageHandler,
  );

  // Toolbar button — discoverability for mouse-first users. The `data-on-click`
  // attribute binds to a method exposed via logseq.provideModel below. Inline
  // SVG (vs. a referenced asset) avoids cross-origin URL resolution from the
  // main Logseq UI. Square 24×24 viewBox + 20×20 render size keeps the glyph
  // on the same baseline as the surrounding toolbar icons (home, calendar,
  // alarm…). Teal #14B8A6 (Tailwind teal-500) reads well on both light and
  // dark Logseq themes; eyes + smile are white inside the teal silhouette so
  // they stay visible regardless of host background.
  logseq.App.registerUIItem("toolbar", {
    key: "logseq-ai-actions-toolbar",
    template:
      '<a class="button" data-on-click="openAIActionPicker" title="AI Actions — click to pick an action" aria-label="AI Actions"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="2.5" r="1" fill="#14B8A6"/><line x1="12" y1="3.5" x2="12" y2="5.5" stroke="#14B8A6" stroke-width="1.5" stroke-linecap="round"/><rect x="4" y="5.5" width="16" height="16.5" rx="4" ry="4" fill="#14B8A6"/><circle cx="9" cy="12" r="1.6" fill="#ffffff"/><circle cx="15" cy="12" r="1.6" fill="#ffffff"/><path d="M 9.5 16.5 Q 12 18.5 14.5 16.5" fill="none" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round"/></svg></a>',
  });
  logseq.provideModel({
    openAIActionPicker: async () => {
      await openActionPicker();
    },
  });

  const userCount = Math.max(activeActionsAll.length - SEED_ACTIONS.length, 0);
  const hiddenCount = activeActionsAll.length - activeActions.length;
  console.info(
    `logseq-ai-actions: ready — ${activeActionsAll.length} action${activeActionsAll.length === 1 ? "" : "s"} registered (${userCount} user-defined${hiddenCount > 0 ? `, ${hiddenCount} hidden` : ""})`,
  );
}

async function main(): Promise<void> {
  // Resolve light/dark before anything renders so the very first panel
  // mount uses the right palette. See `theme-sync.ts` and REQUIREMENTS §15.
  void startThemeSync();

  logseq.useSettingsSchema(SETTINGS_SCHEMA);

  logseq.onSettingsChanged((newSettings, oldSettings) => {
    try {
      handlePresetChange(
        newSettings as Record<string, unknown>,
        oldSettings as Record<string, unknown>,
      );
      const prev = String((oldSettings as Record<string, unknown>).userActionsJson ?? "");
      const next = String((newSettings as Record<string, unknown>).userActionsJson ?? "");
      const prevHidden = JSON.stringify(
        (oldSettings as Record<string, unknown>).hiddenActionIds ?? [],
      );
      const nextHidden = JSON.stringify(
        (newSettings as Record<string, unknown>).hiddenActionIds ?? [],
      );
      if (prev !== next || prevHidden !== nextHidden) rebuildRegistry(true);

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

  // Defer the heavy registration (20+ postMessages — slash, palette,
  // context-menu entries for every active action, plus Diagnostics +
  // Manage Actions utilities) to the next macrotask so main() resolves
  // fast. Logseq emits a "plugin takes too long to load" warning if the
  // ready() handshake hangs on synchronous work, and that threshold is
  // easy to hit once we cross ~15 registrations.
  setTimeout(() => {
    registerAllInvocations();
    void runFirstRunFlow();
    // Polls `checkEditing` every 500 ms so the toolbar handler has a
    // recent block UUID to fall back on after the click blurs the
    // editor. See `editing-block-cache.ts`.
    startEditingBlockTracker();
  }, 0);
}

logseq.ready(main).catch((err) => {
  console.error("logseq-ai-actions: failed to start", err);
});
