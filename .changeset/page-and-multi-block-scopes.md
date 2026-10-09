---
"logseq-ai-actions": minor
---

Run actions on several blocks or a whole page, plus a new Improve (restructure) action

- From the command palette or a keyboard shortcut, an action now runs on two or more selected blocks (and their children), or on the whole current page or journal when no block is selected or being edited. One block, or the block you are editing, works as before.
- Spellcheck, Grammar, Rewrite and its tones send one request per block and fill a review panel: a diff per changed block, Accept / Reject per row, Accept all, Cancel. Only accepted blocks are written, and a block you edit during the review is left alone.
- Summarize, Key Points, Outline and Improve read the blocks as one outline and add the result after the selection or at the end of the page; nothing is replaced.
- Empty, image, property-value, code, math, query and embed blocks are skipped; above 50 blocks you are asked before anything is sent.
- New **Improve (restructure)** action: revises a block, selection or page into a clearer, better organised outline that keeps every fact. You review it as a diff against the original outline, can edit it, and accepting adds it as new blocks. Custom actions can use the same review with the new `outline-revise` output mode.
- The diff panel has a **Copy** button for the proposed (or edited) text.
- Fixed: accepting a change on a tagged block could add a second tag named after a long id (for example `6ac8dce4-…`), because the text came back from Logseq with links and tags as raw ids. Links and tags are now shown, sent and written by name; block references keep working. The diff panel no longer shows raw ids either.
- Every action is now listed under Settings → Keymap → Plugins so you can bind a key to it. Before, the actions were not listed there at all, despite what the README said.
