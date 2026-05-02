/// <reference types="@logseq/libs" />

/**
 * Light/dark theme sync between Logseq's host app and the plugin iframe.
 *
 * Logseq's `--ls-*` CSS variables don't cross the cross-origin iframe
 * boundary, but light vs. dark is a single bit and the SDK exposes both
 * a probe (`getStateFromStore('ui/theme')`) and a hook
 * (`onThemeModeChanged`). We resolve the initial mode at boot, toggle
 * `html.dark` on the iframe's documentElement, and re-toggle on every
 * change emitted by the host. The existing CSS in `index.html` already
 * defines the full dark palette under `html.dark` — this module is the
 * missing wiring.
 *
 * Custom community-theme palettes (full `--ls-*` overrides on the host)
 * are NOT mirrored — see REQUIREMENTS §15.
 */

export type ThemeMode = "dark" | "light";

/**
 * Pure: pick the initial mode at boot.
 * - The probed value (from Logseq's store) wins when set.
 * - If probe is null, fall back to the user's OS preference.
 * - Final fallback: light. So `null + false → "light"`.
 */
export function resolveInitialTheme(probed: ThemeMode | null, prefersDark: boolean): ThemeMode {
  if (probed !== null) return probed;
  return prefersDark ? "dark" : "light";
}

/**
 * Best-effort probe of Logseq's persisted theme mode. Wraps the SDK
 * call in try/catch so a path change or version mismatch can't take the
 * plugin down — any throw or non-`'dark'|'light'` return collapses to
 * null, letting `resolveInitialTheme` fall through to OS preference.
 */
async function probeHostTheme(): Promise<ThemeMode | null> {
  try {
    const v = await logseq.App.getStateFromStore<unknown>("ui/theme");
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

function applyMode(mode: ThemeMode): void {
  document.documentElement.classList.toggle("dark", mode === "dark");
}

/**
 * Wire light/dark sync. Resolves the initial mode (probe → OS pref →
 * light), applies it, then subscribes to `onThemeModeChanged` for live
 * updates. Idempotent enough — calling twice will re-apply the current
 * mode and re-subscribe; the SDK accepts duplicate handlers.
 */
export async function startThemeSync(): Promise<void> {
  const probed = await probeHostTheme();
  const prefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyMode(resolveInitialTheme(probed, prefersDark));
  logseq.App.onThemeModeChanged(({ mode }) => applyMode(mode));
}
