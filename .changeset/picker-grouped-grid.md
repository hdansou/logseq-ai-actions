---
"logseq-ai-actions": patch
---

Toolbar action picker switches to a grouped 2-column grid layout:

- Verbose single-column list replaced by five fixed sections — Fix, Rewrite, Transform, Vision, Custom — each rendered as a section header followed by a 2-column grid of compact cards. All 13 seed actions now fit one viewport without scrolling.
- Cards show title + 1–2 monospace pills (scope + output mode; vision pill highlighted). Full descriptions move from inline body text to an HTML `title` hover tooltip so cards stay single-row.
- User-defined actions whose id matches a built-in prefix auto-route into the matching section (e.g., `rewrite-snarky` lands in Rewrite). User-defined cards in any section carry an extra `custom` pill in the accent colour so authorship stays legible.
- New pure helpers `categorizeAction` + `groupActionsForPicker` in `src/ui/picker-categories.ts` with 30 unit tests covering category mapping, fixed section order, empty-category omission, and id-prefix auto-routing.
- Picker modal widened from 520 px to 640 px to give the 2-col grid breathing room. Empty-state ("Place your cursor in a block first." with disabled cards) still applies card-by-card.
