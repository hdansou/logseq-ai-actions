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
  if (action.scope !== "subtree") return { kind: "per-block" };
  if (action.outputMode === "diff-panel" || action.outputMode === "replace") {
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
