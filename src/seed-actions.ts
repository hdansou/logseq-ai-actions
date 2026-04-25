import { type Action, parseAction } from "./action";

// Prompts are tuned for small local models (Gemma 3 4B, Qwen3 ~9B class).
// The hard rule across all prompts is "return ONLY the transformed text" —
// small models love to preface answers with "Here is..." or wrap in quotes,
// which would end up literally pasted back into the user's block.

const SPELLCHECK_PROMPT = `You are a careful spellcheck assistant. Fix ONLY actual spelling errors. Do not change grammar, style, word choice, punctuation, sentence structure, or line breaks. Preserve proper nouns, technical terms, code identifiers, and any intentional stylization (camelCase, ALL_CAPS, neologisms) — if a word is unusual but plausible as a name or jargon, leave it alone. Do not modify content inside code blocks (text between backticks or triple backticks), URLs, email addresses, Logseq [[wikilinks]], or #tags. If nothing is misspelled, return the text exactly as given. Return ONLY the corrected text — no preamble, no explanation, no surrounding quotes, no list of changes.`;

const GRAMMAR_PROMPT = `You are a careful grammar checker. Fix ONLY objective grammatical errors — subject-verb agreement, verb tense consistency, pronoun reference, misplaced or dangling modifiers, incorrect prepositions, run-on sentences, comma splices, parallelism in lists and comparisons, comparative/superlative forms, and word-form confusions (affect/effect, fewer/less, who/whom). Do NOT flag style or note-taking conventions: passive voice, sentence length, split infinitives, sentence-ending prepositions, contractions, deliberate sentence fragments (common in outline bullets), or lowercase sentence starts. The text often comes from a Logseq block — bullet-style brevity and informal register are usually intentional. Do NOT rewrite for tone, concision, or "better flow." Preserve the author's voice and word choice. Preserve and DO NOT change: quoted material, code blocks (text between backticks or triple backticks), URLs, email addresses, file paths, Logseq [[wikilinks]], #tags, proper nouns, and technical or domain-specific terminology. If the text is grammatically correct, return it exactly as given. Return ONLY the corrected text — no preamble, no explanation, no surrounding quotes, no list of changes.`;

const REWRITE_PROMPT = `Rewrite the text to be clearer and more concise while preserving meaning, tone, and any Markdown or wiki-style syntax. Do not add new information. Return ONLY the rewritten text — no preamble, no explanation, no surrounding quotes.`;

const SUMMARIZE_PROMPT = `Summarize the text in 2 to 3 sentences, capturing the key points. Use plain prose; do not use bullet lists. Preserve any essential wiki-style [[links]] or #tags if they appear. Return ONLY the summary — no preamble, no explanation, no surrounding quotes.`;

const KEY_POINTS_PROMPT = `Extract the key points from the text. Return ONLY a plain list — one point per line, no prefix or bullet character, no numbering, no headings, no commentary. Each point should stand alone as a complete short sentence. Aim for 3 to 7 points unless the text clearly warrants more. Do not include "Here are" preambles or closing remarks.`;

/**
 * Built-in seed actions for v1. Each is validated against `ActionSchema`
 * at module-load time so any drift between the TS literal and the schema
 * is caught on import.
 */
export const SEED_ACTIONS: readonly Action[] = Object.freeze([
  parseAction({
    id: "spellcheck",
    title: "Spellcheck",
    description:
      "Fix spelling errors in the current block. Review the proposed text in a diff panel before applying.",
    scope: "block",
    outputMode: "diff-panel",
    systemPrompt: SPELLCHECK_PROMPT,
  }),
  parseAction({
    id: "grammar",
    title: "Grammar",
    description:
      "Fix grammar and punctuation in the current block. Review the proposed text in a diff panel before applying.",
    scope: "block",
    outputMode: "diff-panel",
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
