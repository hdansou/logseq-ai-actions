import { diffWords } from "diff";

/**
 * A contiguous run of characters tagged by its fate in the edit:
 *   - `same`    — present unchanged in both original and proposed
 *   - `removed` — present in original, absent from proposed
 *   - `added`   — absent from original, present in proposed
 *
 * Concatenating `same + removed` segments reconstructs the original.
 * Concatenating `same + added` segments reconstructs the proposed.
 */
export interface DiffSegment {
  readonly kind: "same" | "added" | "removed";
  readonly value: string;
}

/**
 * Word-level diff between `original` and `proposed`. Thin wrapper around
 * `jsdiff`'s `diffWords` that projects the library's `{added, removed,
 * value}` shape onto our tagged-union `DiffSegment`.
 *
 * Empty-value segments are dropped — jsdiff occasionally emits them and
 * they have no meaning for rendering.
 */
export function computeDiff(original: string, proposed: string): DiffSegment[] {
  const raw = diffWords(original, proposed);
  const out: DiffSegment[] = [];
  for (const part of raw) {
    if (!part.value) continue;
    if (part.added) out.push({ kind: "added", value: part.value });
    else if (part.removed) out.push({ kind: "removed", value: part.value });
    else out.push({ kind: "same", value: part.value });
  }
  return out;
}
