---
"logseq-ai-actions": patch
---

Fix vision actions on Logseq Desktop (real fix, supersedes v1.0.1)

`/AI Generate Title` and `/AI Extract Image Text` were still failing on
v1.0.1 with `Not allowed to load local resource: file://...` followed by
`canvas fallback also failed`. The plugin iframe runs at the
`lsp://logseq.io/...` origin (Logseq's custom protocol), and Chromium
blocks both `fetch(file://)` and `<img src="file://">` from a non-`file:`
origin — so v1.0.1's two fallbacks were never going to work.

The asset loader now routes through `logseq.Request._request({ url,
returnType: "base64" })`, which IPCs to Logseq's main process, reads the
file via `node-fetch` (which handles `file://`), and base64-encodes the
response server-side. The renderer-side `fetch` and `<img>+canvas`
strategies are kept as fallbacks for Logseq Web (where host scope is
unreachable and `makeUrl` returns a `blob:` URL).
