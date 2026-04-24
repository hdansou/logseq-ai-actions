import { type Action, parseAction } from "./action";

// Prompts are tuned for small local models (Gemma 3 4B, Qwen3 ~9B class).
// The hard rule across all prompts is "return ONLY the transformed text" —
// small models love to preface answers with "Here is..." or wrap in quotes,
// which would end up literally pasted back into the user's block.

const SPELLCHECK_PROMPT = `You are a careful copy editor. Fix ONLY spelling errors in the text. Preserve the author's voice, meaning, line breaks, and any Markdown or wiki-style syntax ([[links]], #tags, **bold**, etc.). Do not rewrite or restructure. Return ONLY the corrected text — no preamble, no explanation, no surrounding quotes.`;

const GRAMMAR_PROMPT = `You are a careful copy editor. Fix grammar, punctuation, and obvious typos in the text. Preserve the author's voice, meaning, line breaks, and any Markdown or wiki-style syntax. Do not rewrite or restructure — correct only. Return ONLY the corrected text — no preamble, no explanation, no surrounding quotes.`;

const REWRITE_PROMPT = `Rewrite the text to be clearer and more concise while preserving meaning, tone, and any Markdown or wiki-style syntax. Do not add new information. Return ONLY the rewritten text — no preamble, no explanation, no surrounding quotes.`;

const SUMMARIZE_PROMPT = `Summarize the text in 2 to 3 sentences, capturing the key points. Use plain prose; do not use bullet lists. Preserve any essential wiki-style [[links]] or #tags if they appear. Return ONLY the summary — no preamble, no explanation, no surrounding quotes.`;

const KEY_POINTS_PROMPT = `Extract the key points from the text. Return ONLY a plain list — one point per line, no prefix or bullet character, no numbering, no headings, no commentary. Each point should stand alone as a complete short sentence. Aim for 3 to 7 points unless the text clearly warrants more. Do not include "Here are" preambles or closing remarks.`;

/**
 * Built-in seed actions for v1. Each is validated against `ActionSchema`
 * at module-load time so any drift between the TS literal and the schema
 * is caught on import.
 *
 * MVP limitation: all four use `scope: "block"` and `outputMode: "replace"`.
 * Summarize will move to `subtree` scope once the subtree flattener lands
 * (Phase 2). Rewrite/summarize will move to `diff-panel` once the Preact
 * side-panel UI lands (Phase 5). Until then the user relies on Cmd-Z to
 * undo an unwanted transformation.
 */
export const SEED_ACTIONS: readonly Action[] = Object.freeze([
  parseAction({
    id: "spellcheck",
    title: "Spellcheck",
    description: "Fix spelling errors in the current block.",
    scope: "block",
    outputMode: "replace",
    systemPrompt: SPELLCHECK_PROMPT,
  }),
  parseAction({
    id: "grammar",
    title: "Grammar",
    description: "Fix grammar and punctuation in the current block.",
    scope: "block",
    outputMode: "replace",
    systemPrompt: GRAMMAR_PROMPT,
  }),
  parseAction({
    id: "rewrite",
    title: "Rewrite",
    description:
      "Rewrite the current block for clarity and concision. Review the proposed text in a diff panel before applying.",
    scope: "block",
    outputMode: "diff-panel",
    systemPrompt: REWRITE_PROMPT,
  }),
  parseAction({
    id: "summarize",
    title: "Summarize",
    description:
      "Summarize the current block and all its children. Review the summary in a diff panel before applying; children are preserved as supporting detail.",
    scope: "subtree",
    outputMode: "diff-panel",
    systemPrompt: SUMMARIZE_PROMPT,
  }),
  parseAction({
    id: "key-points",
    title: "Key Points",
    description:
      "Extract the key points from the current block and its children. Each point is inserted as a new child block under the current block. Non-destructive — the existing content is not changed.",
    scope: "subtree",
    outputMode: "append-children",
    systemPrompt: KEY_POINTS_PROMPT,
  }),
]);

export function findSeedAction(id: string): Action | undefined {
  if (!id) return undefined;
  return SEED_ACTIONS.find((a) => a.id === id);
}
