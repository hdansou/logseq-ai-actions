import { type Action, ActionSchema } from "../../action";
import type { DraftAction } from "./types";

/** Pure state logic for the Manage Actions panel (no Preact), unit-tested. */

export interface HiddenRow {
  readonly source: "builtin" | "user";
  readonly action: Action;
}

/**
 * One row per hidden id: the user's shadow wins over the built-in it shadows.
 * Built-ins first (seed order), then orphan user actions. Hidden ids that no
 * longer match any action render nothing (the id stays stored, so a
 * re-imported action keeps its hidden state).
 */
export function buildHiddenRows(
  builtin: readonly Action[],
  userActions: readonly Action[],
  hiddenIds: readonly string[],
): HiddenRow[] {
  if (hiddenIds.length === 0) return [];
  const hidden = new Set(hiddenIds);
  const userById = new Map(userActions.map((u) => [u.id, u]));
  const builtinIds = new Set(builtin.map((b) => b.id));
  const rows: HiddenRow[] = [];
  for (const b of builtin) {
    if (!hidden.has(b.id)) continue;
    const shadow = userById.get(b.id);
    rows.push(shadow ? { source: "user", action: shadow } : { source: "builtin", action: b });
  }
  for (const u of userActions) {
    if (hidden.has(u.id) && !builtinIds.has(u.id)) rows.push({ source: "user", action: u });
  }
  return rows;
}

/** Field → first error message. `exceptIndex` is the action being edited (null when creating). */
export function validateDraft(
  draft: DraftAction,
  ctx: {
    readonly userActions: readonly Action[];
    readonly builtinIds: ReadonlySet<string>;
    readonly exceptIndex: number | null;
  },
): Record<string, string> {
  const errs: Record<string, string> = {};
  const parsed = ActionSchema.safeParse(draft);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      if (field && !errs[field]) errs[field] = issue.message;
    }
  }
  if (draft.id) {
    if (ctx.userActions.some((a, i) => a.id === draft.id && i !== ctx.exceptIndex)) {
      errs.id = "Another user action already uses this id.";
    } else if (ctx.builtinIds.has(draft.id) && ctx.exceptIndex === null) {
      // Allow shadowing on intent, but warn when it's almost certainly a mistake.
      errs.id = `Id "${draft.id}" matches a built-in. Pick a different id, or proceed to shadow it (clear this warning by picking a unique id).`;
    }
  }
  return errs;
}

/** `<id>-copy`, then `<id>-copy-2`, `-copy-3` … — the first not in `taken`. */
export function uniqueCopyId(baseId: string, taken: ReadonlySet<string>): string {
  let id = `${baseId}-copy`;
  for (let n = 2; taken.has(id); n += 1) id = `${baseId}-copy-${n}`;
  return id;
}

/** Append parsed actions whose id isn't taken yet (first occurrence wins). */
export function mergeImported(
  existing: readonly Action[],
  parsed: readonly Action[],
): { merged: Action[]; imported: number; skipped: number } {
  const ids = new Set(existing.map((a) => a.id));
  const incoming: Action[] = [];
  for (const a of parsed) {
    if (ids.has(a.id)) continue;
    ids.add(a.id);
    incoming.push(a);
  }
  return {
    merged: [...existing, ...incoming],
    imported: incoming.length,
    skipped: parsed.length - incoming.length,
  };
}
