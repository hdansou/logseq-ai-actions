/**
 * DB graphs store page links, tags and block references as ids in a block's
 * raw title: `[[<uuid>]]`, `#[[<uuid>]]`. `getBlock().title` may come back in
 * that raw form, and writing a raw `#[[<uuid>]]` back through `updateBlock`
 * creates a new tag named after the uuid (seen 2026-10-09). So text is shown,
 * sent and written with page links and tags by name — which `updateBlock`
 * resolves to the existing page or tag — while block references stay ids
 * (a name there would create a page). Pure; the adapter supplies the lookups.
 */

export interface RefInfo {
  readonly title: string;
  /** A page or tag (has a name), as opposed to a block. */
  readonly page: boolean;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ID_REF = new RegExp(`(#?)\\[\\[(${UUID})\\]\\]`, "gi");

/** Ids referenced in the text, first occurrence order, no repeats. */
export function refIds(text: string): string[] {
  return [...new Set([...text.matchAll(ID_REF)].map((m) => (m[2] ?? "").toLowerCase()))];
}

/** A name that can't sit inside `[[ ]]` stays an id rather than risk a wrong link. */
const linkable = (title: string) => title.trim() !== "" && !/\[\[|\]\]/.test(title);

export function refsToNames(text: string, info: ReadonlyMap<string, RefInfo>): string {
  return text.replace(ID_REF, (whole, hash: string, id: string) => {
    const ref = info.get(id.toLowerCase());
    if (!ref?.page || !linkable(ref.title)) return whole;
    if (hash) return /\s/.test(ref.title) ? `#[[${ref.title}]]` : `#${ref.title}`;
    return `[[${ref.title}]]`;
  });
}
