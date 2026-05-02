---
"logseq-ai-actions": patch
---

Plugin UI now follows Logseq's light/dark mode:

- The CSS token set (`--bg`, `--fg`, `--accent`, …) already had a full dark palette scaffolded under `html.dark` in `index.html`, but no listener wired the toggle — panels rendered light regardless of the host. New `src/adapter/theme-sync.ts` fixes the wiring.
- On boot: probe `logseq.App.getStateFromStore('ui/theme')` (try/catch around any SDK throw or non-`'dark'|'light'` return); fall back to `window.matchMedia('(prefers-color-scheme: dark)').matches`; final fallback light. The resolved mode toggles `html.dark` on the iframe's `document.documentElement` before any panel renders.
- `logseq.App.onThemeModeChanged` keeps the toggle in sync live as the user switches modes inside Logseq.
- Pure `resolveInitialTheme(probed, prefersDark)` helper with 3 unit tests covers the resolution logic.
- Custom community-theme palettes that override `--ls-*` on the host are still not mirrored — cross-origin iframe blocks variable propagation and the SDK doesn't expose a per-token API. Deferred; see REQUIREMENTS §15.
