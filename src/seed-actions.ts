import { type Action, parseAction } from "./action";

// Prompts are tuned for small local models (Gemma 3 4B, Qwen3 ~9B class).
// The hard rule across all prompts is "return ONLY the transformed text" —
// small models love to preface answers with "Here is..." or wrap in quotes,
// which would end up literally pasted back into the user's block.

const SPELLCHECK_PROMPT = `You are a careful spellcheck assistant. Fix ONLY actual spelling errors. Do not change grammar, style, word choice, punctuation, sentence structure, or line breaks. Preserve proper nouns, technical terms, code identifiers, and any intentional stylization (camelCase, ALL_CAPS, neologisms) — if a word is unusual but plausible as a name or jargon, leave it alone. Do not modify content inside code blocks (text between backticks or triple backticks), URLs, email addresses, Logseq [[wikilinks]], or #tags. If nothing is misspelled, return the text exactly as given. Return ONLY the corrected text — no preamble, no explanation, no surrounding quotes, no list of changes.`;

const GRAMMAR_PROMPT = `You are a careful grammar checker. Fix ONLY objective grammatical errors — subject-verb agreement, verb tense consistency, pronoun reference, misplaced or dangling modifiers, incorrect prepositions, run-on sentences, comma splices, parallelism in lists and comparisons, comparative/superlative forms, and word-form confusions (affect/effect, fewer/less, who/whom). Do NOT flag style or note-taking conventions: passive voice, sentence length, split infinitives, sentence-ending prepositions, contractions, deliberate sentence fragments (common in outline bullets), or lowercase sentence starts. The text often comes from a Logseq block — bullet-style brevity and informal register are usually intentional. Do NOT rewrite for tone, concision, or "better flow." Preserve the author's voice and word choice. Preserve and DO NOT change: quoted material, code blocks (text between backticks or triple backticks), URLs, email addresses, file paths, Logseq [[wikilinks]], #tags, proper nouns, and technical or domain-specific terminology. If the text is grammatically correct, return it exactly as given. Return ONLY the corrected text — no preamble, no explanation, no surrounding quotes, no list of changes.`;

const REWRITE_PROMPT = `Rewrite the text to be clearer and more concise while preserving meaning, tone, and any Markdown or wiki-style syntax. Do not add new information. Return ONLY the rewritten text — no preamble, no explanation, no surrounding quotes.`;

const REWRITE_FORMAL_PROMPT = `Rewrite the text in a formal, professional tone suitable for business or academic contexts. Use precise vocabulary, complete sentences, and conventional grammar. Do not add new information or change the meaning. Preserve any Markdown or wiki-style syntax ([[links]], #tags, **bold**, etc.). Return ONLY the rewritten text — no preamble, no explanation, no surrounding quotes.`;

// "Writing the Amazon Way" — Amazon's internal writing guidance famously favours
// narrative clarity over bullets/PowerPoint: short declarative sentences, active
// voice, specific nouns, data over adjectives, and zero weasel words.
const REWRITE_PROFESSIONAL_PROMPT = `Rewrite the text following "Writing the Amazon Way" principles. Use clear, declarative sentences in active voice, one idea per sentence. Prefer concrete nouns and specific data over vague adjectives. Remove weasel words ("very", "really", "many", "some", "could be", "might", "basically") and filler. Keep sentences short and direct. Do not add new information or change the meaning. Preserve any Markdown or wiki-style syntax ([[links]], #tags, **bold**, etc.). Return ONLY the rewritten text — no preamble, no explanation, no surrounding quotes.`;

const REWRITE_CASUAL_PROMPT = `Rewrite the text in a casual, conversational tone, as if talking to a friend. Use contractions and everyday words where they fit naturally. Do not add new information or change the meaning. Preserve any Markdown or wiki-style syntax ([[links]], #tags, **bold**, etc.). Return ONLY the rewritten text — no preamble, no explanation, no surrounding quotes.`;

const REWRITE_FRIENDLY_PROMPT = `Rewrite the text in a warm, friendly, approachable tone. Keep it natural — do not overdo it with exclamation marks or forced enthusiasm. Do not add new information or change the meaning. Preserve any Markdown or wiki-style syntax ([[links]], #tags, **bold**, etc.). Return ONLY the rewritten text — no preamble, no explanation, no surrounding quotes.`;

const SUMMARIZE_PROMPT = `Summarize the text in 2 to 3 sentences, capturing the key points. Use plain prose; do not use bullet lists. Preserve any essential wiki-style [[links]] or #tags if they appear. Return ONLY the summary — no preamble, no explanation, no surrounding quotes.`;

const KEY_POINTS_PROMPT = `Extract the key points from the text. Return ONLY a plain list — one point per line, no prefix or bullet character, no numbering, no headings, no commentary. Each point should stand alone as a complete short sentence. Aim for 3 to 7 points unless the text clearly warrants more. Do not include "Here are" preambles or closing remarks.`;

const OUTLINE_PROMPT = `Organize the text as a nested outline. Use a markdown bulleted list with two-space indent per nesting level (e.g., "- Parent", then "  - Child", then "    - Grandchild"). Each bullet should be a short complete phrase, not a long sentence. Group related ideas under a common parent. Aim for 2 to 5 top-level items and up to 3 levels of depth where it makes sense; do not force depth. Do not add new information — every bullet must be grounded in the source text. Return ONLY the bulleted outline — no headings, no code fences, no numbering, no commentary.`;

// Image-title prompt — tuned for small vision models (Qwen3.5 0.8B/2B,
// Llava, Qwen2.5-VL). Three explicit constraints: count (3), length (3-6
// words), register (descriptive not poetic). The "one per line, no prefix"
// shape lets `parseTitles` extract candidates cleanly.
const IMAGE_TITLE_PROMPT = `You are a precise image describer. Look at the image and produce exactly THREE candidate titles for it. Each title must be a short factual description in 3 to 6 words, sentence case (only the first word capitalized, plus proper nouns). Be concrete: name what is actually visible (subject, setting, notable objects), not what it might mean. Avoid metaphor, mood words, and poetic flourishes. Return ONLY the three titles, one per line, with no numbering, no bullets, no quotes, no commentary, no preamble.`;

// OCR prompt — extract text verbatim, format as nested outline, with
// well-formed markdown tables (header + |---|---| separator) emitted as
// standalone blocks rather than nested under bullets. Hands the output
// directly to `parseOutline`, which now slurps tables into single leaf
// nodes alongside the prose tree.
const EXTRACT_IMAGE_TEXT_PROMPT = `You are a precise OCR assistant. Extract ALL visible text from the image. Use a nested markdown bulleted outline for prose, headings, and lists — two-space indentation per nesting level (e.g., "- Heading", then "  - Sub-line"). For well-formed tables, use markdown table syntax with a header separator row (\`|---|---|\`); place the table as a standalone block, NOT nested under a bullet. Preserve reading order. Extract text exactly as written — do not summarize, paraphrase, translate, or interpret. Include numbers, dates, code, URLs, and email addresses verbatim. If a region is unreadable or ambiguous, skip it rather than guessing. If the image contains no text, return an empty response. Return ONLY the extracted content — no commentary, no preamble, no code fences.`;

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
    id: "rewrite-formal",
    title: "Rewrite Formal",
    description:
      "Rewrite the current block in a formal, professional tone. Review the proposed text in a diff panel before applying.",
    scope: "block",
    outputMode: "diff-panel",
    systemPrompt: REWRITE_FORMAL_PROMPT,
  }),
  parseAction({
    id: "rewrite-professional",
    title: "Rewrite Professional",
    description:
      'Rewrite the current block following "Writing the Amazon Way" principles — declarative sentences, active voice, concrete nouns, no weasel words. Review the proposed text in a diff panel before applying.',
    scope: "block",
    outputMode: "diff-panel",
    systemPrompt: REWRITE_PROFESSIONAL_PROMPT,
  }),
  parseAction({
    id: "rewrite-casual",
    title: "Rewrite Casual",
    description:
      "Rewrite the current block in a casual, conversational tone. Review the proposed text in a diff panel before applying.",
    scope: "block",
    outputMode: "diff-panel",
    systemPrompt: REWRITE_CASUAL_PROMPT,
  }),
  parseAction({
    id: "rewrite-friendly",
    title: "Rewrite Friendly",
    description:
      "Rewrite the current block in a warm, friendly tone. Review the proposed text in a diff panel before applying.",
    scope: "block",
    outputMode: "diff-panel",
    systemPrompt: REWRITE_FRIENDLY_PROMPT,
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
  parseAction({
    id: "outline-replace",
    title: "Outline (replace children)",
    description:
      "Reorganize the current block and its children as a nested outline. The block's text is kept; its existing children are replaced with the generated outline tree. Destructive — review the preview carefully.",
    scope: "subtree",
    outputMode: "outline-replace",
    systemPrompt: OUTLINE_PROMPT,
  }),
  parseAction({
    id: "outline-append",
    title: "Outline (append)",
    description:
      "Generate a nested outline of the current block and its children, and append it as new descendants. Non-destructive — existing children are preserved.",
    scope: "subtree",
    outputMode: "outline-append",
    systemPrompt: OUTLINE_PROMPT,
  }),
  parseAction({
    id: "image-title",
    title: "Generate Title",
    description:
      "Analyze an image asset block with a vision model and propose three candidate titles to set as the block's title. Pick one in the picker; the existing title is offered as a non-candidate option. Requires a vision-capable model (e.g. qwen3.5:2b, qwen2.5-vl, llava).",
    scope: "block",
    outputMode: "picker-replace",
    kind: "vision",
    systemPrompt: IMAGE_TITLE_PROMPT,
  }),
  parseAction({
    id: "extract-image-text",
    title: "Extract Image Text",
    description:
      "Extract all visible text from an image asset block via a vision model and append it as nested child blocks in outline format. Well-formed markdown tables in the source are preserved as standalone child blocks. Non-destructive — the image and any existing children are preserved. Requires a vision-capable model.",
    scope: "block",
    outputMode: "outline-append",
    kind: "vision",
    systemPrompt: EXTRACT_IMAGE_TEXT_PROMPT,
  }),
]);

export function findSeedAction(id: string): Action | undefined {
  if (!id) return undefined;
  return SEED_ACTIONS.find((a) => a.id === id);
}
