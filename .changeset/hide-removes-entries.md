---
"logseq-ai-actions": minor
---

Hidden actions disappear from every menu at once

- Hiding an action now removes it immediately from the slash menu, the command palette (typing `AI:` lists only the actions you keep), keyboard shortcuts and the right-click menu — not only from the toolbar picker. Restoring it brings everything back at once. No plugin reload.
- Adding, deleting or renaming a custom action also updates the menus right away; the plugin no longer needs to be toggled off and on.
- Docs: plugin settings (custom actions, hidden actions, endpoint) apply to every graph, not per graph, and are deleted when the plugin is uninstalled.
