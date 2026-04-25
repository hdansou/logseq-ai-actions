/**
 * Pure helpers for inspecting Logseq DB-graph asset blocks.
 *
 * In DB graphs, an image is its own block, tagged `:logseq.class/Asset`,
 * carrying namespaced properties (`logseq.property.asset/type`,
 * `logseq.property.asset/checksum`, etc.). The on-disk file lives at
 * `<graph-dir>/assets/<block.uuid>.<type>` — the filename uses the
 * **block uuid**, NOT the checksum. Source: logseq-db-plugin-api skill.
 *
 * Property keys are inconsistently serialised by the SDK — sometimes with
 * a leading colon, sometimes without, sometimes nested in a `properties`
 * bag. `getAssetType` probes all three to be robust.
 */

/** Raster image extensions we accept as input to a vision model. */
export const RASTER_IMAGE_TYPES = ["png", "jpg", "jpeg", "gif", "webp"] as const;
type RasterImageType = (typeof RASTER_IMAGE_TYPES)[number];

const MIME_BY_TYPE: Readonly<Record<RasterImageType, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/**
 * Loose shape of a Logseq asset block as seen from the SDK. We only
 * type the fields we read; everything else is `unknown`.
 */
export interface AssetBlock {
  readonly uuid?: string;
  readonly "logseq.property.asset/type"?: unknown;
  readonly ":logseq.property.asset/type"?: unknown;
  readonly "block/tags"?: ReadonlyArray<{ readonly "block/title"?: unknown }>;
  readonly tags?: ReadonlyArray<{ readonly title?: unknown }>;
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly [key: string]: unknown;
}

/**
 * Read the asset type ("png", "jpg", etc.) from a Logseq block, regardless
 * of which key shape the SDK chose. Returns the raw string (preserving the
 * SDK's case) or `undefined` if no asset/type key is present.
 */
export function getAssetType(block: AssetBlock): string | undefined {
  const direct = block["logseq.property.asset/type"];
  if (typeof direct === "string") return direct;
  const colon = block[":logseq.property.asset/type"];
  if (typeof colon === "string") return colon;
  const nested = block.properties?.["logseq.property.asset/type"];
  if (typeof nested === "string") return nested;
  for (const [k, v] of Object.entries(block)) {
    if (k.endsWith("asset/type") && typeof v === "string") return v;
  }
  return undefined;
}

/**
 * True iff the block is a Logseq Asset whose file is a raster image we can
 * feed to a vision model. Excludes svg (vector), pdf, mp3, etc.
 *
 * Detection relies on `logseq.property.asset/type` alone — that property
 * is set only by Logseq's own asset infrastructure, so its presence with
 * a raster extension is sufficient. We deliberately do NOT require a
 * `block/tags` membership check: the SDK serialises tags as entity ids /
 * `:logseq.class/Asset` idents in some shapes and as `[{block/title: "Asset"}]`
 * in others, and a brittle name match was producing false negatives on
 * real DB-graph asset blocks.
 */
export function isImageAsset(block: AssetBlock): boolean {
  const type = getAssetType(block)?.toLowerCase();
  if (!type) return false;
  return (RASTER_IMAGE_TYPES as readonly string[]).includes(type);
}

/**
 * Map a Logseq asset/type string to a MIME type for the data URL we send
 * to the vision endpoint. Returns `undefined` for unknown / non-image types.
 */
export function imageMimeType(assetType: string): string | undefined {
  const t = assetType.toLowerCase();
  return (MIME_BY_TYPE as Record<string, string | undefined>)[t];
}

/**
 * Construct the in-graph path Logseq uses for an asset block:
 * `assets/<uuid>.<ext>`. Pass this to `logseq.Assets.makeUrl(path)` to
 * get a fetchable URL. Returns `null` if uuid or asset/type is missing.
 */
export function assetFilePath(block: AssetBlock): string | null {
  const uuid = block.uuid;
  if (typeof uuid !== "string" || uuid.length === 0) return null;
  const type = getAssetType(block);
  if (!type) return null;
  return `assets/${uuid}.${type.toLowerCase()}`;
}
