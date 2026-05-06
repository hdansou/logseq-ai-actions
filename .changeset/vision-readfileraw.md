---
"logseq-ai-actions": patch
---

Vision actions: switch from `:httpRequest` to `:readFileRaw` IPC

v1.0.4 successfully reached Logseq's `:httpRequest` IPC handler via the
postMessage caller, but `:httpRequest` uses `node-fetch@3.3.2` which has
dropped `file://` support — every call returned `URL scheme "file" is not
supported`.

Switch to `:readFileRaw`, which uses `fs.readFileSync` directly and
returns a Node Buffer. We get bytes back through Electron IPC structured
clone + Postmate, copy into a fresh `ArrayBuffer`, and FileReader-encode
to base64.

Path translation: strip `file://` from `Assets.makeUrl`'s output,
`decodeURIComponent`, and (on Windows) drop the leading `/` before the
drive letter. Helper `fileUrlToPath` handles all three.
