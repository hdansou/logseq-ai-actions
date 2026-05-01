# UI Mockups

Static-HTML design references that informed the Preact panels under `src/ui/`.
Open any `.html` file directly in a browser — no build step.

| Mockup | What it shows | Implemented in |
|---|---|---|
| `index.html` | Index page linking every variant below | — |
| `A-sidebar.html` | Discarded direction: actions in a Logseq right-sidebar pane | (not built) |
| `B-blocks.html` | Discarded direction: actions inline as block widgets | (not built) |
| `C-gallery.html` | **Chosen direction.** Action gallery with built-ins + user actions in card grid | `src/ui/ManageActionsPanel.tsx` (gallery view) |
| `C-create.html` | New-action form (empty draft) | `DetailEditor` in `ManageActionsPanel.tsx` |
| `C-view-builtin.html` | Read-only inspect of a built-in action with "Duplicate as user action" CTA | `DetailReadonly` in `ManageActionsPanel.tsx` |
| `C-empty.html` | First-run state — no user actions yet | gallery empty-state branch |
| `C-validation.html` | Inline validation errors on the editor form | `DetailEditor` `liveErrors` + summary banner |
| `C-delete.html` | Delete confirmation overlay | `ConfirmOverlay` (`src/ui/ConfirmOverlay.tsx`) |

`_shared.css` and `_C-styles.css` carry the design tokens reused by every mockup.

These files are reference material, not deliverables — they are NOT bundled
into `dist/` and not loaded by the plugin at runtime.
