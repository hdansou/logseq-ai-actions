const CODE_FENCE = /^```[a-zA-Z0-9_-]*$/;
// Only treat a line as a preamble if it's clearly framing/labelling the
// list (e.g. "Here are three titles:", "Titles:") — not a real title that
// happens to start with the word "title".
const PREAMBLE = /^(?:here (?:are|is)\b|(?:the\s+)?(?:three\s+)?titles?\s*:)/i;
const NUMBER_PREFIX = /^\s*\d+\s*[.):]\s+/;
const BULLET_PREFIX = /^\s*[-*•]\s+/;
const TRAILING_PUNCT = /[.,;:!]+$/;

/**
 * Parse an LLM response into up to `n` candidate titles.
 *
 * Designed for small vision models that interpret "one title per line"
 * loosely. We tolerate:
 *   - numbered prefixes (1., 1), 1:)
 *   - bullet prefixes (-, *, •)
 *   - wrapping quotes (single or double)
 *   - "Here are three titles:" preambles
 *   - ```code fences``` around the list
 *   - blank lines, leading/trailing whitespace
 *   - duplicate suggestions (deduped, first occurrence wins)
 *   - over-emission (more than n lines — capped)
 *   - trailing periods/commas/semicolons that would look noisy in a title
 *     (question marks and exclamation points are preserved)
 *   - collapsed multi-space runs inside a candidate
 */
export function parseTitles(raw: string, n: number): string[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !CODE_FENCE.test(line))
    .filter((line) => !PREAMBLE.test(line));

  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    let s = line.replace(NUMBER_PREFIX, "").replace(BULLET_PREFIX, "");
    // Strip a single layer of matching wrapping quotes.
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1).trim();
    }
    s = s.replace(TRAILING_PUNCT, "").replace(/\s+/g, " ").trim();
    if (s.length === 0) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(s);
    if (cleaned.length >= n) break;
  }
  return cleaned;
}
