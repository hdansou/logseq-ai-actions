import { getAssetType } from "./image-asset";

/**
 * Which blocks a page / multi-block run works on (REQUIREMENTS §18). Pure: the
 * adapter hands in the block trees (page tree or selected blocks) and gets back
 * the eligible blocks in document order.
 */

export interface TargetNode {
  readonly uuid: string;
  readonly title?: string;
  readonly children?: readonly TargetNode[];
  readonly [key: string]: unknown;
}

export interface Target {
  readonly uuid: string;
  readonly text: string;
  readonly depth: number;
}

export type SkipReason = "empty" | "asset" | "property" | "code" | "math" | "query" | "embed";

/** Most blocks one run may touch; above this the caller asks before going on. */
export const MAX_TARGETS = 50;

/** Value of the first key ending in `suffix`, ignoring a leading `:` in key and value. */
function propertyBySuffix(node: TargetNode, suffix: string): string | undefined {
  for (const [key, value] of Object.entries(node)) {
    if (key.endsWith(suffix) && typeof value === "string") return value.replace(/^:/, "");
  }
  return undefined;
}

const hasKey = (node: TargetNode, ...keys: string[]) =>
  keys.some((k) => node[k] != null || node[`:${k}`] != null);

/** Why a block isn't text the model should edit, or null when it is. */
export function skipReason(node: TargetNode): SkipReason | null {
  if (getAssetType(node)) return "asset";
  // A text property's value is stored as a block and shows up in page trees.
  if (hasKey(node, "logseq.property/created-from-property")) return "property";
  if (hasKey(node, "logseq.property/query")) return "query";
  if (hasKey(node, "block/link", "link")) return "embed";
  const display = propertyBySuffix(node, "node/display-type");
  if (display === "code" || display === "math") return display;

  const text = (node.title ?? "").trim();
  if (!text) return "empty";
  if (/^```[\s\S]*```$/.test(text)) return "code";
  if (/^\$\$[\s\S]*\$\$$/.test(text)) return "math";
  return null;
}

/**
 * Eligible blocks in document order. A block reached twice (a selected parent
 * and its selected child) is kept once; a skipped block's children are still
 * walked. `roots` lists the top-level blocks actually walked (duplicates
 * dropped), so combined output can go after the last one.
 */
export function collectTargets(roots: readonly TargetNode[]): {
  targets: Target[];
  skipped: number;
  roots: string[];
} {
  const targets: Target[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  const walk = (node: TargetNode, depth: number) => {
    if (seen.has(node.uuid)) return;
    seen.add(node.uuid);
    if (skipReason(node)) skipped++;
    else targets.push({ uuid: node.uuid, text: (node.title ?? "").trim(), depth });
    for (const child of node.children ?? []) walk(child, depth + 1);
  };
  const walked: string[] = [];
  for (const root of roots) {
    if (seen.has(root.uuid)) continue;
    walked.push(root.uuid);
    walk(root, 0);
  }
  return { targets, skipped, roots: walked };
}
