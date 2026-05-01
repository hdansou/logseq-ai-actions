import type { Action } from "../../action";

/** Draft shape used by the editor form — all string-typed so half-filled forms don't fight the schema. */
export interface DraftAction {
  id: string;
  title: string;
  description: string;
  scope: string;
  outputMode: string;
  kind: string;
  systemPrompt: string;
}

export const BLANK_DRAFT: DraftAction = {
  id: "",
  title: "",
  description: "",
  scope: "block",
  outputMode: "diff-panel",
  kind: "text",
  systemPrompt: "",
};

export function draftFrom(a: Action): DraftAction {
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    scope: a.scope,
    outputMode: a.outputMode,
    kind: a.kind,
    systemPrompt: a.systemPrompt,
  };
}

/** Build a kebab-case id suggestion from a free-text title. */
export function suggestIdFromTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Inline hints rendered under the scope / output-mode / kind fields. The
 * hint text refreshes whenever the user changes the selection so they
 * read the description of the *current* choice — no dropdown spelunking.
 */
export const SCOPE_HINTS: Readonly<Record<string, string>> = {
  selection:
    "Highlighted text within the block. v1 falls back to block scope (selection-range support is deferred — see REQUIREMENTS §14).",
  block: "Text of the block under the cursor only. Most rewrites use this.",
  subtree:
    "The block plus all its descendants, flattened into a Markdown outline. Used for summarising or outlining accumulated content.",
};

export const OUTPUT_MODE_HINTS: Readonly<Record<string, string>> = {
  replace: "Overwrites the block's text with the model's response. No review step.",
  "diff-panel":
    "Side-by-side Original vs Proposed; Accept / Reject / switch to Edit mode before applying. Best for substantive changes.",
  "append-children":
    "Appends the model's response as new child blocks (one line per child). Non-destructive — the parent block and existing children are untouched.",
  "outline-replace":
    "Parses the response as a nested outline (with markdown-table support); deletes the block's existing direct children, then inserts the parsed tree. Destructive — confirm panel warns first.",
  "outline-append":
    "Same parser as outline-replace, but appends without deleting. Non-destructive — pre-existing children are preserved. Used by the OCR action.",
  "picker-replace":
    "Treats the response as N candidates (one per line); user picks one in a panel; replaces the block's text with the chosen value.",
};

export const KIND_HINTS: Readonly<Record<string, string>> = {
  text: "Sends the block's resolved text (per scope) to the model. Almost every action uses this.",
  vision:
    "Sends an image asset's bytes — only valid on Asset-tagged blocks with a raster image type (png/jpg/jpeg/gif/webp). Requires a vision-capable model (qwen3.5, qwen2.5-vl, llava). Uses the Vision model setting (falls back to Model when empty).",
};

/**
 * Display-sort actions alphabetically by title (case-insensitive). The
 * underlying storage order in `userActionsJson` isn't touched — this is
 * a render-time pass so the UI stays scannable when the seed set + user
 * additions grow past a dozen entries.
 */
export function sortByTitle<T extends { title: string }>(actions: readonly T[]): T[] {
  return [...actions].sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
}

/** Filter built-ins + user actions by a search query (matches title, id, prompt). */
export function filterByQuery<T extends Action>(actions: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [...actions];
  return actions.filter(
    (a) =>
      a.title.toLowerCase().includes(q) ||
      a.id.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.systemPrompt.toLowerCase().includes(q),
  );
}

/** Friendly short label for an output mode (used in card meta tags). */
export function outputModeLabel(mode: string): string {
  switch (mode) {
    case "diff-panel":
      return "diff";
    case "append-children":
      return "append";
    case "outline-replace":
      return "outline-rep";
    case "outline-append":
      return "outline-app";
    case "picker-replace":
      return "pick";
    default:
      return mode;
  }
}

export type View =
  | { kind: "gallery" }
  | { kind: "view-builtin"; actionId: string }
  | { kind: "edit"; index: number }
  | { kind: "create" }
  | { kind: "import" };
