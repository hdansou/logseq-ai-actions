/// <reference types="@logseq/libs" />
import { type AssetBlock, assetFilePath, getAssetType, imageMimeType } from "../image-asset";

/**
 * Read an image asset block's bytes and base64-encode them for the vision
 * provider. Resolves to `null` when the block isn't a usable image (wrong
 * type, missing path, fetch failed). Uses `FileReader.readAsDataURL` so we
 * don't have to hand-roll a binary→base64 encoder.
 */
export async function loadImageAssetBytes(
  block: AssetBlock,
): Promise<{ mimeType: string; base64: string } | null> {
  const path = assetFilePath(block);
  if (!path) return null;
  const type = getAssetType(block);
  if (!type) return null;
  const mimeType = imageMimeType(type);
  if (!mimeType) return null;

  let url: string;
  try {
    url = await logseq.Assets.makeUrl(path);
  } catch {
    return null;
  }
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return null;
  const blob = await res.blob().catch(() => null);
  if (!blob) return null;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        resolve(null);
        return;
      }
      const commaIdx = result.indexOf(",");
      if (commaIdx === -1) {
        resolve(null);
        return;
      }
      resolve({ mimeType, base64: result.slice(commaIdx + 1) });
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}
