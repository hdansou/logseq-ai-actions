import type { Action } from "../action";

export type PickerCategory = "fix" | "rewrite" | "transform" | "vision" | "custom";

/** An Action enriched with whether it came from the built-in seed set. */
export type TaggedAction = Action & { readonly isBuiltin: boolean };

/** A section in the picker — header label + ordered list of actions. */
export interface PickerGroup {
  readonly category: PickerCategory;
  readonly label: string;
  readonly actions: readonly TaggedAction[];
}

const CATEGORY_ORDER: readonly PickerCategory[] = [
  "fix",
  "rewrite",
  "transform",
  "vision",
  "custom",
];

const CATEGORY_LABELS: Record<PickerCategory, string> = {
  fix: "Fix",
  rewrite: "Rewrite",
  transform: "Transform",
  vision: "Vision",
  custom: "Custom",
};

/**
 * Maps an action to one of five fixed picker categories. `kind: "vision"`
 * short-circuits all id-pattern checks because vision dispatch is a
 * runtime concern (different LLM call path), not a label — a hypothetical
 * `id: "rewrite"` action with `kind: "vision"` still belongs in Vision.
 *
 * For non-vision actions the matcher checks `id === keyword` OR
 * `id startsWith keyword + "-"` (so `rewriter` won't be miscategorised
 * as Rewrite, but `rewrite-snarky` will). User-defined actions follow
 * the same rules; the picker tags them with a `custom` pill at render
 * time so authorship stays legible.
 */
export function categorizeAction(action: Pick<Action, "id" | "kind">): PickerCategory {
  if (action.kind === "vision") return "vision";
  const id = action.id;
  if (matches(id, ["spellcheck", "grammar"])) return "fix";
  if (matches(id, ["rewrite"])) return "rewrite";
  if (matches(id, ["summarize", "key-points", "outline"])) return "transform";
  return "custom";
}

function matches(id: string, keywords: readonly string[]): boolean {
  for (const k of keywords) {
    if (id === k) return true;
    if (id.startsWith(`${k}-`)) return true;
  }
  return false;
}

/**
 * Bucket pre-tagged actions into the five fixed picker sections.
 * Categories are emitted in `CATEGORY_ORDER`; empty categories are
 * omitted (we don't render an empty Vision section on graphs without
 * vision-capable actions). Within each section, actions keep their
 * declared order — important so user-defined Rewrite tones land in a
 * predictable spot relative to the seed tones.
 */
export function groupActionsForPicker(actions: readonly TaggedAction[]): readonly PickerGroup[] {
  const buckets = new Map<PickerCategory, TaggedAction[]>();
  for (const action of actions) {
    const cat = categorizeAction(action);
    let list = buckets.get(cat);
    if (!list) {
      list = [];
      buckets.set(cat, list);
    }
    list.push(action);
  }
  const out: PickerGroup[] = [];
  for (const cat of CATEGORY_ORDER) {
    const list = buckets.get(cat);
    if (list && list.length > 0) {
      out.push({ category: cat, label: CATEGORY_LABELS[cat], actions: list });
    }
  }
  return out;
}
