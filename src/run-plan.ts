import type { Action } from "./action";
import { MAX_TARGETS, type Target } from "./targets";

/**
 * How a page / multi-block run uses an action (REQUIREMENTS §18). Pure.
 *
 * - per-block: one request per target, reviewed in one panel.
 * - combined: all targets flattened into one request; the result is appended,
 *   never replacing — as one block (Summarize) or as children of a new block
 *   titled after the action (Key Points, Outline).
 */
export type RunPlan =
  | { readonly kind: "per-block" }
  | { readonly kind: "combined"; readonly result: "block" }
  | { readonly kind: "combined"; readonly result: "children"; readonly heading: string }
  | { readonly kind: "unsupported"; readonly reason: string };

/** Input budget for a combined request (characters of flattened outline). */
export const MAX_COMBINED_CHARS = 6000;

export function planRun(action: Pick<Action, "kind" | "scope" | "outputMode" | "title">): RunPlan {
  if (action.kind === "vision") {
    return { kind: "unsupported", reason: "Image actions work on one image block at a time." };
  }
  const rewritesBlock = action.outputMode === "diff-panel" || action.outputMode === "replace";
  if (action.scope !== "subtree") {
    // A block action that adds blocks (children, outline, picked title) would
    // have its output written over each block in a per-block run.
    return rewritesBlock
      ? { kind: "per-block" }
      : {
          kind: "unsupported",
          reason: "This action adds blocks under one block — run it on a single block.",
        };
  }
  if (rewritesBlock) {
    return { kind: "combined", result: "block" };
  }
  return { kind: "combined", result: "children", heading: action.title };
}

const outlineLine = (t: Target) => `${"  ".repeat(t.depth)}- ${t.text}`;

/** Targets as one Markdown outline (same shape as `flattenSubtree`). */
export function flattenTargets(targets: readonly Target[]): string {
  return targets.map(outlineLine).join("\n");
}

/**
 * The part of a run that fits the cap: the first MAX_TARGETS blocks, and for a
 * combined run only whole blocks that keep the input within MAX_COMBINED_CHARS
 * (at least one). `capped` tells the caller to ask before going on.
 */
export function capTargets(
  targets: readonly Target[],
  kind: "per-block" | "combined",
): { targets: Target[]; capped: boolean } {
  let kept = targets.slice(0, MAX_TARGETS);
  if (kind === "combined") {
    let length = 0;
    let count = 0;
    for (const t of kept) {
      const line = outlineLine(t).length + (count > 0 ? 1 : 0);
      if (count > 0 && length + line > MAX_COMBINED_CHARS) break;
      length += line;
      count++;
    }
    kept = kept.slice(0, count);
  }
  return { targets: kept, capped: kept.length < targets.length };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Toast after a per-block run's accepted changes are written. */
export function appliedMessage(title: string, applied: number, stale: number, failed = 0): string {
  const parts = [`${title}: applied ${plural(applied, "change", "changes")}`];
  if (stale > 0) {
    parts.push(`${plural(stale, "block was", "blocks were")} edited during the run and left as is`);
  }
  if (failed > 0) parts.push(`${plural(failed, "block", "blocks")} failed to save`);
  return parts.join("; ");
}

/**
 * What a palette / shortcut command runs on (REQUIREMENTS §18): two or more
 * selected blocks; else one block (selected, or being edited — opening the
 * palette while editing selects that block) on the single-block path; else the
 * current page. `none` = no page either (e.g. the Journals home view).
 */
export function commandTarget(state: {
  selected: number;
  editing: boolean;
  page: boolean;
}): "selection" | "single" | "page" | "none" {
  if (state.selected > 1) return "selection";
  if (state.selected === 1 || state.editing) return "single";
  return state.page ? "page" : "none";
}

export type CombinedScope =
  | { readonly kind: "page"; readonly uuid: string }
  | { readonly kind: "zoomed"; readonly uuid: string }
  | { readonly kind: "selection" };

export type Insert =
  | { readonly kind: "page-end"; readonly page: string }
  | { readonly kind: "last-child"; readonly parent: string }
  | { readonly kind: "after"; readonly sibling: string };

/**
 * Where a combined run's result goes, and how to say so: end of the page;
 * last child of a zoomed-in block (a sibling would land outside the view);
 * after the last top-level selected block.
 */
export function combinedPlacement(
  scope: CombinedScope,
  lastRoot: string | undefined,
): { insert: Insert | null; where: string } {
  if (scope.kind === "page") {
    return { insert: { kind: "page-end", page: scope.uuid }, where: "at the end of the page" };
  }
  if (scope.kind === "zoomed") {
    return {
      insert: { kind: "last-child", parent: scope.uuid },
      where: "at the end of the zoomed-in block",
    };
  }
  return {
    insert: lastRoot ? { kind: "after", sibling: lastRoot } : null,
    where: "after the selection",
  };
}
