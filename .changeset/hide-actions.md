---
"logseq-ai-actions": minor
---

Hide actions you don't use, individually, from Manage Actions

The Manage Actions panel now has a per-row Hide button (built-in or
user-defined). Hidden actions move into a collapsible Hidden bin pinned
to the bottom of the panel; click Restore there to bring them back. An
undo toast surfaces the most recent hide/restore for ~2.5 s. Visibility
autosaves — no Save / Cancel ceremony.

Hidden actions disappear immediately from the toolbar picker and the
diff-panel "Re-run with another action" dropdown. Slash, command-palette,
and block-context-menu entries keep responding for the rest of the
current Logseq session and only stop registering after a plugin reload
— same caveat that already applies to user-action add/remove.

State is stored in a new `hiddenActionIds` plugin setting (per-graph,
real string array). The Manage panel is the only writer; the gear-icon
settings UI does not expose it on purpose.
