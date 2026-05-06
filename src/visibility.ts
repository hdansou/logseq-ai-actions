import type { Action } from "./action";

/**
 * Drop every action whose id appears in `hiddenIds`. Order-preserving;
 * returns the input untouched when nothing is hidden.
 *
 * Applied at the boundary between the merged registry (built-ins +
 * `userActionsJson`) and every consumer that surfaces actions to the
 * user — toolbar picker, slash commands, command palette, block
 * context menu. The Manage Actions panel uses the unfiltered registry
 * plus the raw `hiddenActionIds` list so it can still display and
 * restore hidden entries (see REQUIREMENTS §16).
 */
export function filterHiddenActions(
  actions: readonly Action[],
  hiddenIds: readonly string[],
): readonly Action[] {
  if (hiddenIds.length === 0) return actions;
  const hidden = new Set(hiddenIds);
  return actions.filter((a) => !hidden.has(a.id));
}

/**
 * Coerce the raw `hiddenActionIds` plugin setting into a `string[]`,
 * tolerant of every shape Logseq's settings store can return: `undefined`
 * before any user has touched the setting, the empty array as the default,
 * a populated array of strings as the happy path, or — defensively —
 * non-array values and arrays containing non-string entries.
 *
 * Always returns a fresh array, never throws. Bad shapes degrade to `[]`
 * (or to a filtered subset for arrays with stray entries) so a corrupted
 * setting can never crash the plugin.
 */
export function parseHiddenActionIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string");
}

/**
 * Split `actions` into `visible` and `hidden` buckets, preserving the
 * input's declared order within each bucket. Used by the Manage Actions
 * panel to render the visible sections (Built-in / Your actions) and
 * the collapsible Hidden bin from a single pass.
 */
export function partitionVisibleAndHidden(
  actions: readonly Action[],
  hiddenIds: readonly string[],
): { readonly visible: readonly Action[]; readonly hidden: readonly Action[] } {
  if (hiddenIds.length === 0) return { visible: actions, hidden: [] };
  const hiddenSet = new Set(hiddenIds);
  const visible: Action[] = [];
  const hidden: Action[] = [];
  for (const a of actions) {
    if (hiddenSet.has(a.id)) hidden.push(a);
    else visible.push(a);
  }
  return { visible, hidden };
}
