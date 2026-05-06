/// <reference types="@logseq/libs" />
import { type AssetBlock, assetFilePath, getAssetType, imageMimeType } from "../image-asset";
import { describeOriginMismatch, type LoadAssetFailure } from "../asset-url";

export type LoadImageAssetResult =
  | { ok: true; mimeType: string; base64: string }
  | { ok: false; reason: LoadAssetFailure; hint?: string };

/**
 * Read an image asset block's bytes and base64-encode them for the vision
 * provider. Returns a discriminated union so callers can show a precise
 * toast instead of collapsing every failure to "path or asset type
 * unrecognised".
 *
 * Strategy: (1) `fetch(makeUrl(path))` — works under filesystem-load and
 * marketplace install. (2) `<img>` → canvas → `toDataURL` fallback —
 * defensive layer for Electron builds where `<img>` is more permissive than
 * `fetch`. Both paths fail under HMR (`http://localhost`) when `makeUrl`
 * returns `file://` — `describeOriginMismatch` detects that and the hint
 * tells the user to switch to `pnpm build:watch` or marketplace install.
 */
export async function loadImageAssetBytes(block: AssetBlock): Promise<LoadImageAssetResult> {
  const path = assetFilePath(block);
  if (!path) return { ok: false, reason: "no-path" };
  const type = getAssetType(block);
  if (!type) return { ok: false, reason: "no-type" };
  const mimeType = imageMimeType(type);
  if (!mimeType) return { ok: false, reason: "unsupported-mime" };

  let url: string;
  try {
    url = await logseq.Assets.makeUrl(path);
  } catch {
    return { ok: false, reason: "makeurl-failed" };
  }

  const fetched = await tryFetchAsDataUrl(url, mimeType);
  if (fetched.ok) return fetched;

  const canvased = await tryCanvasAsDataUrl(url, mimeType);
  if (canvased.ok) return canvased;

  const reason: LoadAssetFailure = canvased.reason === "decode-failed" ? "decode-failed" : "fetch-failed";
  const hint = describeOriginMismatch(window.location.origin, url) ?? undefined;
  return hint ? { ok: false, reason, hint } : { ok: false, reason };
}

async function tryFetchAsDataUrl(
  url: string,
  mimeType: string,
): Promise<LoadImageAssetResult> {
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return { ok: false, reason: "fetch-failed" };
  const blob = await res.blob().catch(() => null);
  if (!blob) return { ok: false, reason: "fetch-failed" };
  const dataUrl = await blobToDataUrl(blob);
  if (!dataUrl) return { ok: false, reason: "decode-failed" };
  const base64 = stripDataUrlPrefix(dataUrl);
  return base64 ? { ok: true, mimeType, base64 } : { ok: false, reason: "decode-failed" };
}

async function tryCanvasAsDataUrl(
  url: string,
  mimeType: string,
): Promise<LoadImageAssetResult> {
  // Defensive: some Electron builds let <img> load file:// where fetch is
  // denied. Canvas re-encodes the pixels, which is fine for a vision-model
  // input — we are not preserving original bytes for cryptographic purposes.
  // Diagnostic: this branch only runs after fetch failed; logging it tells
  // us which path served the bytes when verifying marketplace vs unpacked
  // installs.
  console.warn("[ai-actions] image-loader: canvas fallback engaged (fetch failed)", url);
  const dataUrl = await imageToDataUrl(url, mimeType);
  if (!dataUrl) {
    console.warn("[ai-actions] image-loader: canvas fallback also failed");
    return { ok: false, reason: "fetch-failed" };
  }
  console.warn("[ai-actions] image-loader: canvas fallback succeeded");
  const base64 = stripDataUrlPrefix(dataUrl);
  return base64 ? { ok: true, mimeType, base64 } : { ok: false, reason: "decode-failed" };
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

function imageToDataUrl(url: string, mimeType: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL(mimeType));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function stripDataUrlPrefix(dataUrl: string): string | null {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) return null;
  return dataUrl.slice(commaIdx + 1);
}
