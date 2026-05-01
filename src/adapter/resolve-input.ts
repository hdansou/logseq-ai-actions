/// <reference types="@logseq/libs" />
import type { Action } from "../action";
import { type BlockNode, flattenSubtree } from "../subtree";

export interface ResolvedInput {
  readonly uuid: string;
  /** Text sent to the LLM (may be a flattened outline for subtree scope). */
  readonly llmInput: string;
  /** Text displayed as "Original" in the diff panel — the content being replaced. */
  readonly displayOriginal: string;
}

export type ResolveResult = ResolvedInput | { readonly uuid: null; readonly reason: string };

/**
 * Resolve the LLM input for an action from the block the cursor is in,
 * or from a specific block uuid when the invocation surface provides
 * one (e.g., block context menu).
 *
 *   - `block`: both LLM input and diff "original" are the block's own text.
 *   - `subtree`: LLM input is the flattened outline; diff "original" stays
 *     the parent block's own text (what actually gets replaced). Otherwise
 *     the diff view shows "outline → summary" which lights up every word
 *     as "changed" and is misleading.
 *   - `selection`: treated as `block` until the selection-range adapter
 *     lands (REQUIREMENTS §14).
 */
export async function resolveInput(
  action: Action,
  explicitBlockUuid?: string,
): Promise<ResolveResult> {
  const current = explicitBlockUuid
    ? await logseq.Editor.getBlock(explicitBlockUuid)
    : await logseq.Editor.getCurrentBlock();
  if (!current?.uuid) {
    return {
      uuid: null,
      reason: explicitBlockUuid
        ? "Couldn't read that block — was it deleted?"
        : "Place your cursor inside a block first.",
    };
  }

  const currentText = String(
    (current as unknown as { title?: string; content?: string }).title ??
      (current as unknown as { content?: string }).content ??
      "",
  ).trim();

  if (action.scope === "subtree") {
    const full = (await logseq.Editor.getBlock(current.uuid, {
      includeChildren: true,
    })) as unknown as BlockNode & { uuid: string };
    const outline = flattenSubtree(full).trim();
    if (!outline || outline === "-") {
      return { uuid: null, reason: "This block and its children have no text to process." };
    }
    return { uuid: current.uuid, llmInput: outline, displayOriginal: currentText };
  }

  if (!currentText) return { uuid: null, reason: "This block has no text to process." };
  return { uuid: current.uuid, llmInput: currentText, displayOriginal: currentText };
}
