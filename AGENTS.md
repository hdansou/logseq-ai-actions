# AGENTS.md

Guidance that can't be discovered by reading the repo. For spec and plan see `REQUIREMENTS.md` and `tasks.md`.

## Identity landmines

- **Author display name is `Danzu`** (GitHub handle `hdansou`; email `hdansou@gmail.com`). Do not re-derive the display name from the email handle — an earlier guess of "Hermann Dansou" was wrong.
- **Package name is `logseq-ai-actions`; local directory is `logseq-action/`.** The mismatch is intentional — don't "normalize" either side.

## Dev server

- **`pnpm dev -- --port N` does NOT reliably forward the port flag to Vite.** Use `pnpm exec vite --port N --strictPort` instead. `--strictPort` turns the usual silent fallback into a hard error, which you want because the workspace often has other plugin dev servers squatting 8080/8081/8082 (`logseq-progressbar`, `logseq-atlas`, `Callout Manager`, …). Silent fallback means you end up testing a different plugin without realising.
- **Vite binds to `127.0.0.1`, not `0.0.0.0`.** Logseq loads the bundle from localhost; LAN exposure is unnecessary and would publish every dev iteration to the local network. Pass `--host 0.0.0.0` only when you genuinely need cross-device testing.
- **Don't leave `dist/` on disk while running `vite` in dev mode.** Vite happily serves real files under the project root, so a stale `dist/index.html` from a previous `pnpm build` will be served *instead of* the SPA fallback to root `index.html` — and the stale bundle it references will trigger `[Ready Error] [deferred timeout] undefined` in the plugin iframe. If you ran `pnpm build` for any reason (incl. a pre-commit hook), `rm -rf dist/` before reloading the plugin.
- **`public/` is captured at Vite start.** Adding files to `public/` while Vite is running may not be picked up until restart. If a freshly-added `/foo.png` serves HTML (SPA fallback) instead of the file, restart the dev server.

## Working rhythm

- **`tasks.md` is the persistent tracker.** Update it when work lands. Session-level task tools don't replace it.
- **User-visible changes require a `pnpm changeset`.** The `[Unreleased]` section of `CHANGELOG.md` is no longer hand-edited — changesets owns it.
- **Pre-commit hook runs `biome check --write` + `tsc --noEmit`.** Never use `--no-verify`. If the hook fails, fix the cause.

## Architectural rules

- **Keep the Logseq-touching surface thin.** One adapter module wraps `logseq.Editor.*` / `logseq.App.*`; everything else (registry, scope resolver, endpoint classifier, diff, streaming parser) stays pure so Tier 1 unit tests can reach it. The 80 % coverage gate is only achievable under this rule — a PR that thickens the adapter without a compelling reason should be pushed back on.
- **Only `src/index.ts` does `import "@logseq/libs"`.** Every other module that needs the `logseq` global uses `/// <reference types="@logseq/libs" />` for types only. Vitest crashes on the SDK's browser-only bootstrap (`ReferenceError: self is not defined`) otherwise — see the `logseq-plugin-dev` skill's `runtime-gotchas.md §11`.
- **SDK pinned via the `next` dist-tag at `^0.3.2`.** Public npm `latest` points at the legacy `0.0.17` line. Do not run `pnpm update @logseq/libs` without checking the dist-tag.
- **Loading raw bytes for an asset path requires `logseq.Request._request`, not `fetch`.** `logseq.Assets.makeUrl` returns `file:///abs/path` on Desktop, `blob:` on Web. The plugin iframe is served at `lsp://logseq.io/...` (custom protocol registered in `logseq/src/electron/electron/core.cljs:97-105`); cross-origin `fetch(file://)` and `<img src="file://">` are both blocked by Chromium ("Not allowed to load local resource"). The canonical path is `logseq.Request._request({ url, returnType: "base64" })`, which IPCs to the main process where `node-fetch` reads `file://` directly (`logseq/src/electron/electron/handler.cljs:353-389`). `src/adapter/image-loader.ts` uses this as the primary path on Desktop and falls back to `fetch` then `<img>+canvas` for Logseq Web (where host scope is unreachable and `makeUrl` returns a `blob:` URL fetch can read). `host-scope.ts:logseqFetch` uses the same `_request` for HTTP/CORS bypass.
- **The SDK `.d.ts` understates what's available — read Logseq's cljs source instead.** v1.0.1 of this plugin shipped a fetch + `<img>+canvas` strategy on the assumption that `IAssetsProxy` was the only surface for asset I/O. That was wrong; `Request._request` (underscore-prefixed but in-source-documented) handles `file://` URLs via the host process. When an SDK guarantee looks too thin, grep `/Users/dzu/Projects/src/github.com/logseq-dev/logseq/src/main/...` and `.../src/electron/...` before designing around the limitation.
- **After changing plugin code, disable + re-enable the plugin in Logseq settings.** Slash-command / palette / context-menu / toolbar handlers are registered at plugin-enable time and capture a reference to the module they were loaded with — Vite HMR rebuilds the bundle but the running handler still points at the old module. Symptom: a fix you just shipped doesn't appear (e.g., a refactored toast still shows the old string). Cmd+R on Logseq's window also works but is heavier.
