const CODE_FENCE = /^```[a-zA-Z0-9_-]*$/;
const BULLET_PREFIX = /^\s*(?:[-*•]|\d+[.)])\s+/;
const PREAMBLE = /^(?:here (?:are|is)\b|key points\b)/i;

/**
 * Parse an LLM response into an array of standalone key points.
 *
 * The prompt instructs the model to return one point per line with no
 * prefix, but small local models often ignore half of that: they
 * sprinkle in `- `, `* `, or numbered prefixes, occasionally wrap the
 * whole response in a code fence, and sometimes open with a "Here are
 * the key points:" preamble. We defensively strip all of it so the
 * child-block inserter gets clean single-line content.
 */
export function parsePoints(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !CODE_FENCE.test(line))
    .filter((line) => !PREAMBLE.test(line))
    .map((line) => line.replace(BULLET_PREFIX, ""))
    .filter((line) => line.length > 0);
}
