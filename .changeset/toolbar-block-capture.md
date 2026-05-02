---
"logseq-ai-actions": patch
---

Toolbar AI Actions picker now resolves the focused block reliably:

- Previously, clicking the toolbar bot icon blurred the editor before the click handler ran — `getCurrentBlock()` returned null and the chosen action errored out, contradicting the picker's "Click to run on the current block" subtitle.
- New `src/adapter/editing-block-cache.ts` polls a three-tier probe (`checkEditing` → `getCurrentBlock` → `getSelectedBlocks`) every 500 ms and caches the most recent block UUID with a 10-second freshness window. `onRouteChanged` clears the cache so cross-page leaks are impossible. `openActionPicker` runs the live probe first, falls back to the cache, then threads the resolved UUID through to `runAction`'s `explicitBlockUuid` argument (same path the context-menu invocation already uses; vision actions inherit it via `runVisionAction`).
- When both the live probe and the cache come back null, the picker shows a clear empty state: every action card is disabled (greyed, click swallowed) and the header subtitle changes to "Place your cursor in a block first." in red. Footer entries (Close, Diagnostics, Manage actions) stay enabled. New exported helper `derivePickerState(uuid)` in `ActionPickerPanel.tsx` with unit tests.
