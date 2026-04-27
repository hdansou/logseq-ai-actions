---
"logseq-ai-actions": patch
---

Production-readiness pass:

- API key setting is now a single-line input (was multi-line textarea), and its description + the README Privacy section explicitly call out that the value is stored UNENCRYPTED in Logseq's plugin-settings file on disk.
- Diagnostics panel privacy: noted that captured upstream HTTP error excerpts may include reflected request headers — treat screenshots as sensitive.
- Removed the unverified "Goose" endpoint preset; users who had it selected will fall back to defaults next time settings are read.
- Replaced the system `window.confirm()` prompts in the Manage Actions panel and the Diff panel with styled in-modal overlays (Esc cancels, Enter confirms) — consistent with the rest of the plugin UX.
- Patched 6 transitive vulnerabilities (1 high, 5 moderate) flowing through `@logseq/libs`: forced `lodash-es ^4.18.1` and `dompurify ^3.4.1` via `pnpm.overrides`. `pnpm audit` now reports clean.
- Dev server now binds to `127.0.0.1` instead of `0.0.0.0` (LAN exposure was unintentional). Override with `--host` if you need cross-device testing.

Internal refactors (no behaviour change):

- Extracted shared iframe-mount helper (`src/ui/mount-panel.ts`) used by every `show-*.ts` panel launcher; removed ~80 lines of repeated boilerplate.
- Consolidated `src/provider.ts` around a single `postChat()` transport — non-streaming text, streaming text, and vision now share URL/headers/timeout/error handling.
- Merged `performLLMCall` + `performLLMStream` in `src/index.ts` into one `performLLM(action, input, settings, onChunk?)`.
- Extracted `closeBusyToast()` and `formatProviderError()` helpers used at multiple sites in `src/index.ts`.
- New shared `ConfirmOverlay` component replaces the bespoke `DeleteOverlay` and powers both the new discard-changes prompts.
