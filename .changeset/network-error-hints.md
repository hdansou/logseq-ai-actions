---
"logseq-ai-actions": patch
---

Clearer connection errors

When a request can't reach the LLM server, the error now says what to check:
for `EHOSTUNREACH` (common on macOS 15+ when Logseq lacks Local Network
access to a server on another machine) it points to System Settings →
Privacy & Security → Local Network; `ECONNREFUSED` asks whether the server is
running on that port; `ENOTFOUND` suggests checking the host name. The README
has a short section on connecting to a server on another machine.
