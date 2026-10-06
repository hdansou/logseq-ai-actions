---
"logseq-ai-actions": patch
---

Document keyboard shortcuts as Logseq Keymap UI only

Every action — built-in and user-defined — already registers as a
Logseq command, so it appears automatically in **Settings → Keyboard
shortcuts**. Open that, search for `AI:`, click the binding cell next
to e.g. `AI: Grammar`, and press your chord (single keys, modified
keys, or two-key sequences like `g g` are all supported). Bindings set
there persist across plugin reloads.

The plugin doesn't ship default shortcuts: any prefix risks colliding
with Logseq core or another plugin in some users' setups, and the
keymap UI is one click away.

Doc-only release — no schema changes, no UI changes, no behaviour
changes. The `Action` JSON does NOT have a `keybinding` field; the
Manage Actions panel does not author chords. Settings → Keyboard
shortcuts owns keybinding state end-to-end.
