/// <reference types="@logseq/libs" />
import { findPreset } from "../presets";
import { parseHiddenActionIds } from "../visibility";

/**
 * Snapshot of plugin settings at a point in time. Read fresh through
 * `readSettings()` every time — `logseq.settings` is a property getter
 * that returns a snapshot; a captured local copy goes stale after
 * `updateSettings` (runtime-gotchas §7).
 */
export interface ResolvedSettings {
  readonly baseUrl: string;
  readonly model: string;
  readonly visionModel: string;
  readonly apiKey: string;
  readonly temperature: number;
  readonly timeoutMs: number;
  readonly debugLog: boolean;
  readonly userActionsJson: string;
  /**
   * Action ids the user has hidden via Manage Actions. Plugin-internal
   * state — written via `logseq.updateSettings({ hiddenActionIds })`,
   * not declared in `SETTINGS_SCHEMA` (the gear UI doesn't render it
   * because users edit visibility through the Manage panel, not text).
   * See REQUIREMENTS §16.
   */
  readonly hiddenActionIds: readonly string[];
}

const PRIMARY_DEFAULT = findPreset("lm-studio");

export function readSettings(): ResolvedSettings {
  const s = (logseq.settings ?? {}) as Record<string, unknown>;
  const fallback = PRIMARY_DEFAULT;
  return {
    baseUrl: String(s.baseUrl ?? fallback?.baseUrl ?? "http://localhost:1234/v1"),
    model: String(s.model ?? fallback?.defaultModel ?? "local-model"),
    visionModel: String(s.visionModel ?? ""),
    apiKey: String(s.apiKey ?? ""),
    temperature: Number(s.temperature ?? 0.3),
    timeoutMs: Number(s.timeoutMs ?? 60_000),
    debugLog: Boolean(s.debugLog ?? false),
    userActionsJson: String(s.userActionsJson ?? ""),
    hiddenActionIds: parseHiddenActionIds(s.hiddenActionIds),
  };
}

/**
 * Read a private (underscore-prefixed) plugin-settings key directly via
 * the `logseq.settings` getter. These keys are kept OUT of
 * `SETTINGS_SCHEMA` so they don't render in the visible settings UI —
 * they're plugin-internal persistence, not user configuration.
 */
export function readPrivateSetting<T extends string>(key: string, fallback: T): string {
  const s = (logseq.settings ?? {}) as Record<string, unknown>;
  const v = s[key];
  return typeof v === "string" ? v : fallback;
}

/**
 * When the user picks a different preset, auto-fill `baseUrl` and `model`
 * from that preset — but only if the user hasn't customised the current
 * values (i.e., they still match the *previous* preset's defaults or are
 * empty). This avoids clobbering a custom URL the user typed in.
 */
export function handlePresetChange(
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
