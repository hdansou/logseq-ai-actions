---
"logseq-ai-actions": patch
---

Fix image actions (image title, extract image text) failing on Logseq Desktop builds that serve graph assets over `assets://`

The plugin could only read images behind `file://` URLs, so on current Desktop
builds it skipped the file read and the vision action failed. It now reads
`assets://` images too.
