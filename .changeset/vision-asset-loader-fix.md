---
"logseq-ai-actions": patch
---

Fixes vision actions (Generate Title, Extract Image Text) on Logseq Desktop where they previously failed with a misleading "could not read the image bytes (path or asset type unrecognised)" toast on otherwise-valid PNG/JPEG/GIF/WebP asset blocks.

- `loadImageAssetBytes` (`src/adapter/image-loader.ts`) returns a discriminated `{ ok: true; mimeType; base64 } | { ok: false; reason; hint? }` instead of collapsing every failure to `null`. Reasons: `no-path`, `no-type`, `unsupported-mime`, `makeurl-failed`, `fetch-failed`, `decode-failed`. The `runVisionAction` toast renders the actual reason in plain language.
- New pure module `src/asset-url.ts` holds `failureMessage(reason, hint?)` and `describeOriginMismatch(origin, url)` — 14 unit tests cover every reason variant and origin-mismatch branch.
- Adds an `<img>` → canvas → `toDataURL(mimeType)` fallback after `fetch` fails. v1.0.0 had no fallback; this is a real coverage gain. Canvas re-encoding is lossless for PNG and acceptable for JPEG/WebP (vision models downscale anyway).
- Empirically verified on Logseq Desktop: the v1.0.0 plugin code reliably hits "Not allowed to load local resource" when reading `file://` asset URLs, while the patched code reliably succeeds via the fetch path. Mechanism is not fully understood (the `fetch(url)` call is byte-identical between versions) but the behaviour is stable across both `pnpm dev` HMR and `pnpm build` unpacked installs.
- Docs: AGENTS.md adds a landmine entry on stale slash-command handlers after code changes (disable + re-enable the plugin to refresh).
