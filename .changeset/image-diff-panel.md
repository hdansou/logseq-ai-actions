---
"logseq-ai-actions": minor
---

Image actions can be reviewed and edited in the diff panel

- A custom image action with `outputMode: "diff-panel"` shows the model's whole reply against the image's current title, editable and copyable. Accept sets the first line as the image's title and adds the rest as a block under the image — e.g. a short title plus a full description (the README has a ready-made example). Generate Title stays a one-line title picker.
- Fixed: in a zoomed-in view Logseq reports a selected block several times, which made the plugin treat one block as a multi-block selection (and refuse image actions there).
- Image actions only accept the output modes that work for images (`picker-replace`, `outline-append`, `diff-panel`); other modes used to fall back to the title picker without saying so and are now flagged in Manage Actions and in the JSON setting.
- The diff panel shows "Streaming…" and model errors even when it has no action buttons (Improve, image actions); before, a failed request left an empty Proposed column.
