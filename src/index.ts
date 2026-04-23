import "@logseq/libs";

import type { Action } from "./action";
import { findPreset, PRESETS } from "./presets";
import { createOpenAIProvider, LLMProviderError } from "./provider";
import { SEED_ACTIONS } from "./seed-actions";

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

const provider = createOpenAIProvider();

/**
 * Run a single seed action against the block the cursor is currently in.
 * MVP behaviour: block scope + replace mode for all four seed actions.
 * Future work (Phase 5): honour `action.scope` (selection, subtree) and
 * `action.outputMode` (diff-panel).
 */
async function runAction(action: Action): Promise<void> {
  let busyToastKey: string | number | null = null;
  try {
    const block = await logseq.Editor.getCurrentBlock();
    if (!block?.uuid) {
      logseq.UI.showMsg("Place your cursor inside a block first.", "warning");
      return;
    }

    // Per runtime-gotchas §13, prefer `title` over the deprecated `content`.
    const content = String(
      (block as unknown as { title?: string; content?: string }).title ??
        (block as unknown as { content?: string }).content ??
        "",
    ).trim();
    if (!content) {
      logseq.UI.showMsg("This block has no text to process.", "warning");
      return;
    }

    const settings = readSettings();
    const msg = await logseq.UI.showMsg(`${action.title}…`, "info", { timeout: 0 });
    busyToastKey = (msg as unknown as string | number | null) ?? null;

    // Only include apiKey when non-empty — `exactOptionalPropertyTypes`
    // disallows passing `undefined` to an optional field.
    const output = await provider.complete({
      baseUrl: settings.baseUrl,
      model: settings.model,
      system: action.systemPrompt,
      user: content,
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

    if (!output) {
      logseq.UI.showMsg(`${action.title}: empty response from model`, "warning");
      return;
    }

    await logseq.Editor.updateBlock(block.uuid, output);
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

  console.info(`logseq-ai-actions: ready — registered ${SEED_ACTIONS.length} slash commands`);
}

logseq.ready(main).catch((err) => {
  console.error("logseq-ai-actions: failed to start", err);
});
