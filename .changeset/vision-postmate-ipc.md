---
"logseq-ai-actions": patch
---

Vision actions: route asset reads through the postMessage caller (real fix)

v1.0.3's diagnostics revealed the actual failure mode: `logseq.Request._request`
is unavailable from the plugin iframe in current Logseq builds. The plugin runs
at `lsp://logseq.io/...` cross-origin with the Logseq main window, so when
`Request._request` calls `Experiments.invokeExperMethod` → `ensureHostScope()`
(a synchronous `parent.window.logseq` property access), Chromium blocks it
with `SecurityError: Blocked a frame with origin "lsp://logseq.io" from
accessing a cross-origin frame`.

The fix uses Logseq's Postmate-based caller, which goes through `window.postMessage`
and IS cross-origin-safe (it's the same mechanism that powers slash commands and
settings). We call `logseq._execCallableAPIAsync("exper_request", pluginId,
{ url, returnType: "base64" })` and listen for `#lsp#request#callback` events
on `logseq.caller` to receive the response. The host runs the same
`:httpRequest` IPC handler that `Request._request` would have triggered, so
the bytes are still read via `node-fetch` (which handles `file://`).

Race protection: the listener is registered before the call, and responses
are buffered by `requestId` until our id is known.
