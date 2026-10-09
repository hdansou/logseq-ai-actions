/// <reference types="@logseq/libs" />
import { type RefInfo, refIds, refsToNames } from "../ref-names";

/**
 * Text with page links and tags by name, block references as ids — the only
 * form that is safe to show, send and write back (see `ref-names.ts`).
 */
export async function namesForRefs(raw: string): Promise<string> {
  const ids = refIds(raw);
  if (ids.length === 0) return raw;
  const info = new Map<string, RefInfo>();
  for (const id of ids) {
    // getBlock without options includes pages; a page has a `name`.
    const entity = (await logseq.Editor.getBlock(id)) as {
      name?: string;
      title?: string;
      originalName?: string;
    } | null;
    if (!entity) continue;
    info.set(id, {
      title: String(entity.title ?? entity.originalName ?? entity.name ?? ""),
      page: typeof entity.name === "string",
    });
  }
  return refsToNames(raw, info);
}

/** A block's text in that form, trimmed; null when the block is gone. */
export async function readBlockText(uuid: string): Promise<string | null> {
  const block = (await logseq.Editor.getBlock(uuid)) as { title?: string; content?: string } | null;
  if (!block) return null;
  return namesForRefs(String(block.title ?? block.content ?? "").trim());
}
