---
"logseq-ai-actions": minor
---

Run actions on several blocks or a whole page, plus a new Improve (restructure) action

- From the command palette or a keyboard shortcut, an action now runs on two or more selected blocks (and their children), or on the whole current page or journal when no block is selected or being edited. One block, or the block you are editing, works as before.
- Spellcheck, Grammar, Rewrite and its tones send one request per block and fill a review panel: a diff per changed block, Accept / Reject per row, Accept all, Cancel. Only accepted blocks are written, and a block you edit during the review is left alone.
- Summarize, Key Points, Outline and Improve read the blocks as one outline and add the result after the selection or at the end of the page; nothing is replaced.
- Empty, image, property-value, code, math, query and embed blocks are skipped; above 50 blocks you are asked before anything is sent.
- New **Improve (restructure)** action: revises a block, selection or page into a clearer, better organised outline that keeps every fact.
- Every action is now listed under Settings → Keymap → Plugins so you can bind a key to it. Before, the actions were not listed there at all, despite what the README said.
