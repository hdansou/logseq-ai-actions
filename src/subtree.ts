/**
 * Shape the flattener accepts. Intentionally minimal — matches the
 * subset of `BlockEntity` we need, plus the `title` field that
 * `@logseq/libs` 0.3.x returns (runtime-gotchas §13). Pure types only,
 * no SDK import, so Vitest loads the module cleanly.
 */
export interface BlockNode {
  readonly title?: string;
  readonly content?: string;
  readonly children?: readonly BlockNode[];
}

export interface FlattenOptions {
  readonly indentSpaces?: number;
}

/**
 * Render a Logseq block + its descendants as a Markdown-outline string
 * (leading `"- "`, 2-space indent per depth by default, lines separated
 * by `"\n"`). Stable output so the LLM can reason about hierarchy.
 *
 * Caller guarantees the input is actually a subtree — we do not walk up
 * to the root or fetch unloaded children. In the Logseq adapter, use
 * `logseq.Editor.getBlock(uuid, { includeChildren: true })` before
 * passing here.
 */
export function flattenSubtree(block: BlockNode, options: FlattenOptions = {}): string {
  const indent = options.indentSpaces ?? 2;
  return walk(block, 0, indent).join("\n");
}

function walk(block: BlockNode, depth: number, indentSpaces: number): string[] {
  const text = (block.title ?? block.content ?? "").trim();
  const prefix = " ".repeat(depth * indentSpaces);
  const lines: string[] = [`${prefix}- ${text}`];
  for (const child of block.children ?? []) {
    for (const line of walk(child, depth + 1, indentSpaces)) {
      lines.push(line);
    }
  }
  return lines;
}
