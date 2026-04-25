/** A node in a parsed outline. `children` is empty for leaves. */
export interface OutlineNode {
  readonly text: string;
  readonly children: OutlineNode[];
}

const CODE_FENCE = /^```[a-zA-Z0-9_-]*$/;
const PREAMBLE = /^(?:here (?:are|is)\b|outline\b|the outline\b)/i;
const BULLET_PREFIX = /^(?:[-*•]|\d+[.)])\s+/;

/**
 * Parse an LLM-generated nested-bullet outline into a tree.
 *
 * Designed for small local models that interpret "two-space indent per
 * level" loosely. We tolerate:
 *   - mixed bullet glyphs (`-`, `*`, `•`, `1.`, `1)`)
 *   - tabs OR spaces for indentation (each tab = one level; otherwise
 *     each block of two spaces ≈ one level)
 *   - missing leading bullet (a plain text line is still a node)
 *   - ```code fences``` wrapping the response
 *   - "Here is the outline:" / "Outline:" preambles
 *   - over-indented first lines (we anchor the lowest indent seen as
 *     depth 0 so the tree isn't degenerate)
 *   - skip-level jumps (depth 0 → depth 2): the deeper line attaches
 *     under the most recent node rather than being lost
 */
export function parseOutline(raw: string): OutlineNode[] {
  const cleaned = raw
    .split(/\r?\n/)
    .map((line) => ({ raw: line, trimmed: line.trim() }))
    .filter(({ trimmed }) => trimmed.length > 0)
    .filter(({ trimmed }) => !CODE_FENCE.test(trimmed))
    .filter(({ trimmed }) => !PREAMBLE.test(trimmed));

  if (cleaned.length === 0) return [];

  // Compute indent depth: tabs count as one level each; spaces are
  // bucketed into pairs (2 spaces ≈ one level). Mixed leading whitespace
  // sums both contributions.
  const lines = cleaned.map(({ raw: r, trimmed }) => {
    const leading = r.match(/^[\s]*/)?.[0] ?? "";
    const tabs = (leading.match(/\t/g) ?? []).length;
    const spaces = leading.length - tabs;
    const depth = tabs + Math.floor(spaces / 2);
    const text = trimmed.replace(BULLET_PREFIX, "").trim();
    return { depth, text };
  });

  // Anchor: shift everything so the shallowest depth is 0. Prevents the
  // whole tree collapsing into one branch when the model over-indents.
  const minDepth = Math.min(...lines.map((l) => l.depth));
  const normalized = lines.map((l) => ({ depth: l.depth - minDepth, text: l.text }));

  // Stack-based tree build. `stack[d]` holds the current parent at depth
  // d; when we see a new node at depth d, we attach it to stack[d - 1]
  // (or the roots array if d === 0) and reset stack[d] to it.
  const roots: OutlineNode[] = [];
  // mutable shadow of OutlineNode that we mutate during construction;
  // returned to callers as readonly via the OutlineNode type.
  const stack: { children: OutlineNode[] }[] = [{ children: roots }];

  for (const { depth, text } of normalized) {
    if (text.length === 0) continue;
    // Cap depth at one beyond the deepest seen parent so a skip-jump
    // (e.g., 0 → 2) attaches to the most recent node rather than
    // creating phantom nesting.
    const parentDepth = Math.min(depth, stack.length - 1);
    const node: OutlineNode = { text, children: [] };
    const parent = stack[parentDepth];
    if (!parent) continue; // unreachable given clamp, but appeases noUncheckedIndexedAccess
    parent.children.push(node);
    // Truncate stack so deeper old nodes can't accidentally adopt the
    // next line; record this node as the current parent at depth+1.
    stack.length = parentDepth + 1;
    stack.push({ children: node.children });
  }

  return roots;
}

/** Total number of nodes in the tree (recursive). */
export function countOutlineNodes(nodes: readonly OutlineNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countOutlineNodes(node.children), 0);
}

/**
 * Render an outline tree as an indented preview string for `ConfirmPanel`.
 * Two-space indent per depth, each line prefixed with `• `. Pure — takes
 * a tree, returns a string; no side effects. Empty tree → empty string.
 */
export function renderOutlinePreview(nodes: readonly OutlineNode[], depth = 0): string {
  return nodes
    .map((node) => {
      const indent = "  ".repeat(depth);
      const head = `${indent}• ${node.text}`;
      if (node.children.length === 0) return head;
      return `${head}\n${renderOutlinePreview(node.children, depth + 1)}`;
    })
    .join("\n");
}
