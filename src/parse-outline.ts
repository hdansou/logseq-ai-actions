/** A node in a parsed outline. `children` is empty for leaves. */
export interface OutlineNode {
  readonly text: string;
  readonly children: OutlineNode[];
}

const CODE_FENCE = /^```[a-zA-Z0-9_-]*$/;
const PREAMBLE = /^(?:here (?:are|is)\b|outline\b|the outline\b)/i;
const BULLET_PREFIX = /^(?:[-*•]|\d+[.)])\s+/;

/** A line that COULD be part of a markdown table — starts and ends with `|`. */
function looksLikeTableLine(trimmed: string): boolean {
  return trimmed.length >= 2 && trimmed.startsWith("|") && trimmed.endsWith("|");
}

/**
 * A markdown-table separator row: `|---|---|`, `| --- | --- |`,
 * `|:--|--:|:-:|`, etc. Requires at least one `-` so an empty row of
 * `| | |` doesn't qualify.
 */
function looksLikeTableSeparator(trimmed: string): boolean {
  return /^\|[\s|:-]+\|$/.test(trimmed) && trimmed.includes("-");
}

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
 *
 * Markdown-table support: a header row starting with `|` immediately
 * followed by a separator row (`|---|---|`, alignment markers OK) is
 * slurped together with any subsequent body rows into a single leaf
 * node whose text is the multi-line table verbatim. Tables emit as
 * top-level (depth-0) siblings in source order; subsequent indented
 * bullets restart at depth 0 (the stack is reset). Stray pipe lines
 * that don't form a well-formed table fall through to the normal
 * bullet/text handling.
 */
export function parseOutline(raw: string): OutlineNode[] {
  const cleaned = raw
    .split(/\r?\n/)
    .map((line) => ({ raw: line, trimmed: line.trim() }))
    .filter(({ trimmed }) => trimmed.length > 0)
    .filter(({ trimmed }) => !CODE_FENCE.test(trimmed))
    .filter(({ trimmed }) => !PREAMBLE.test(trimmed));

  if (cleaned.length === 0) return [];

  // First pass: walk cleaned lines and split into items — either a
  // single outline `line` (carrying its raw form for indent computation)
  // or a `table` (the joined multi-line markdown table text).
  type Item = { kind: "line"; raw: string; trimmed: string } | { kind: "table"; text: string };
  const items: Item[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const cur = cleaned[i];
    if (!cur) continue;
    const next = cleaned[i + 1];
    if (looksLikeTableLine(cur.trimmed) && next && looksLikeTableSeparator(next.trimmed)) {
      // Slurp consecutive `|`-bracketed lines (header + separator + body).
      const tableLines: string[] = [];
      while (i < cleaned.length) {
        const tl = cleaned[i];
        if (!tl || !looksLikeTableLine(tl.trimmed)) break;
        tableLines.push(tl.trimmed);
        i++;
      }
      // Step back one because the outer for-loop will increment.
      i--;
      items.push({ kind: "table", text: tableLines.join("\n") });
      continue;
    }
    items.push({ kind: "line", raw: cur.raw, trimmed: cur.trimmed });
  }

  // Compute indent depth for line items: tabs count as one level each;
  // spaces are bucketed into pairs (2 spaces ≈ one level). Mixed leading
  // whitespace sums both contributions.
  const lineItems = items
    .map((it, idx) => ({ idx, item: it }))
    .filter(
      (x): x is { idx: number; item: { kind: "line"; raw: string; trimmed: string } } =>
        x.item.kind === "line",
    );
  const lineDepths = new Map<number, { depth: number; text: string }>();
  for (const { idx, item } of lineItems) {
    const leading = item.raw.match(/^[\s]*/)?.[0] ?? "";
    const tabs = (leading.match(/\t/g) ?? []).length;
    const spaces = leading.length - tabs;
    const depth = tabs + Math.floor(spaces / 2);
    const text = item.trimmed.replace(BULLET_PREFIX, "").trim();
    lineDepths.set(idx, { depth, text });
  }

  // Anchor: shift everything so the shallowest depth is 0. Prevents the
  // whole tree collapsing into one branch when the model over-indents.
  const minDepth =
    lineItems.length === 0 ? 0 : Math.min(...Array.from(lineDepths.values()).map((d) => d.depth));

  // Stack-based tree build. Tables are emitted as depth-0 leaves and
  // reset the stack so later indented bullets re-anchor to root.
  const roots: OutlineNode[] = [];
  const stack: { children: OutlineNode[] }[] = [{ children: roots }];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    if (!item) continue;
    if (item.kind === "table") {
      roots.push({ text: item.text, children: [] });
      stack.length = 1;
      continue;
    }
    const meta = lineDepths.get(idx);
    if (!meta) continue;
    const { text } = meta;
    if (text.length === 0) continue;
    const depth = meta.depth - minDepth;
    // Cap depth at one beyond the deepest seen parent so a skip-jump
    // (e.g., 0 → 2) attaches to the most recent node rather than
    // creating phantom nesting.
    const parentDepth = Math.min(depth, stack.length - 1);
    const node: OutlineNode = { text, children: [] };
    const parent = stack[parentDepth];
    if (!parent) continue;
    parent.children.push(node);
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
