---
"logseq-ai-actions": patch
---

Fix "blocked by CORS policy" errors against local LLM servers that don't send CORS headers

On Logseq Desktop, requests to your LLM endpoint now go through Logseq's
`logseq.Net` (proxied by the app, so browser CORS doesn't apply). Previously
the plugin fell back to a plain browser `fetch` on current Desktop builds, so
servers such as Unsloth needed a CORS setting that most don't have. You no
longer need to enable CORS on the server.

Requires `@logseq/libs` 0.3.4 (bundled). Streamed output now arrives all at
once instead of token by token, because the host returns the whole response.
