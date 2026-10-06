---
"logseq-ai-actions": patch
---

More reliable AI actions on real notes

- Block text that reads like an instruction ("Write a haiku…", "reply only
  with…") is now edited, not obeyed.
- Replies are cleaned before they reach your block: reasoning (`<think>`)
  sections, "Here is…:" lines, and wrapping quotes or code fences are removed.
- References and tags are kept exactly as stored, and actions no longer add
  headings, code fences, task markers, or `key::` lines, which Logseq DB
  graphs would turn into a different kind of block.
- Summarize returns an already-short sentence unchanged instead of inventing
  details; Key Points keep their parent's context; Rewrite Professional uses
  plain words; answers stay in the language of your note; Spellcheck keeps
  British or American spelling as written.
- Grammar is tuned for English with occasional French: each passage is
  corrected in its own language, French phrases in English notes are left
  alone, and corrections are never marked with bold or italics.
