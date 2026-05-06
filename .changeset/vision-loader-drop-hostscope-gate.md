---
"logseq-ai-actions": patch
---

Vision actions: drop host-scope gate from the asset loader, add diagnostics

v1.0.2's IPC branch was gated on `isHostScopeReachable()`, which probes
`window.parent.document` and falls back to `false` whenever that throws.
On the marketplace-zip install the plugin iframe appears to be cross-origin
with the Logseq main window, so the probe returns `false` and the IPC path
was being silently skipped — straight back to the broken `fetch(file://)`
+ canvas fallbacks.

The loader now attempts `logseq.Request._request` unconditionally. The SDK
may emit a one-off "Can not access host scope!" log on Logseq Web, but our
catch falls through cleanly to the `fetch` branch. Each branch in the IPC
attempt now logs `[ai-actions] image-loader: …` with the actual failure
reason so the next regression is debuggable.
