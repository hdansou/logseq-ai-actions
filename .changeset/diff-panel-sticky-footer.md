---
"logseq-ai-actions": patch
---

Diff panel now stays fully usable on long content:

- The modal is capped to the viewport height; only the side-by-side Original / Proposed body scrolls. Reject / Edit / Accept stay pinned to a sticky footer instead of disappearing below the fold on long blocks. Header and action bar stay pinned at the top.
- The four Rewrite tones (Formal, Professional, Casual, Friendly) are now grouped under a single "Rewrite ▾" chip with a dropdown menu, alongside the default Rewrite. The chip row drops from up to eight chips down to four, so it stays scannable as more actions are added. User-defined `rewrite-*` actions automatically join the dropdown.
