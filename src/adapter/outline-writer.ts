/// <reference types="@logseq/libs" />
import type { OutlineNode } from "../parse-outline";

/**
 * Delete every direct child of the given block. Used by `outline-replace`
 * to clear existing descendants before inserting the generated outline.
 * `removeBlock` recursively removes the child's own descendants, so one
 * call per direct child is enough.
 */
export async function removeBlockChildren(blockUuid: string): Promise<void> {
  const block = (await logseq.Editor.getBlock(blockUuid, {
    includeChildren: true,
  })) as unknown as { children?: ReadonlyArray<{ uuid?: string }> } | null;
  const children = block?.children ?? [];
  for (const child of children) {
    if (child.uuid) await logseq.Editor.removeBlock(child.uuid);
  }
}

/**
 * Recursively insert an outline tree as children of `parentUuid`. Each
 * node becomes a child block; its own children are inserted under the
 * freshly-inserted block. Sequential (not parallel) to preserve order —
 * the same rationale as the `append-children` path.
 */
export async function insertOutlineTree(
  parentUuid: string,
  nodes: readonly OutlineNode[],
): Promise<void> {
  for (const node of nodes) {
    const inserted = (await logseq.Editor.insertBlock(parentUuid, node.text, {
      sibling: false,
    })) as { uuid?: string } | null;
    if (inserted?.uuid && node.children.length > 0) {
      await insertOutlineTree(inserted.uuid, node.children);
    }
  }
}
