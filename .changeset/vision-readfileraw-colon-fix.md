---
"logseq-ai-actions": patch
---

Vision: drop leading colon when calling `apis.doAction(['readFileRaw', …])`

v1.0.5 sent `apis.doAction([':readFileRaw', path])` to the host's IPC
dispatcher, but `(keyword ":readFileRaw")` in ClojureScript produces a
keyword whose name is `":readFileRaw"` (the colon is preserved as a
character) — not `:readFileRaw`. Dispatch fell through and the multimethod
threw, dropping us into the broken renderer-side `fetch` fallback.

The SDK's own internals follow the no-colon convention
(`apis.doAction(["readFile", path])` in `lsplugin.user.js`). Aligning to
that lets the `:readFileRaw` handler match, returning the Node Buffer the
loader expects.
