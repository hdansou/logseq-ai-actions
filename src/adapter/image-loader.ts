/// <reference types="@logseq/libs" />

import { describeOriginMismatch, extractRequestBase64, type LoadAssetFailure } from "../asset-url";
import { type AssetBlock, assetFilePath, getAssetType, imageMimeType } from "../image-asset";

export type LoadImageAssetResult =
  | { ok: true; mimeType: string; base64: string }
  | { ok: false; reason: LoadAssetFailure; hint?: string };

/**
 * Read an image asset block's bytes and base64-encode them for the vision
 * provider. Returns a discriminated union so callers can show a precise
 * toast instead of collapsing every failure to "path or asset type
 * unrecognised".
 *
 * Strategy (each step logs `[ai-actions] image-loader: ...` so failures
 * can be diagnosed from the user's console):
 *   (1) `logseq.Request._request({ returnType: "base64" })` — primary on
 *       Desktop. IPCs to Logseq's main process, which uses `node-fetch`
 *       (supports `file://`) and base64-encodes server-side. See
 *       logseq/src/electron/electron/handler.cljs `:httpRequest`. The
 *       plugin iframe runs at `lsp://logseq.io/...` and cannot directly
 *       load `file://` URLs (Chromium blocks cross-origin local
 *       resources), so this IPC route is the canonical path. We attempt
 *       it unconditionally; the SDK may emit a one-off "Can not access
 *       host scope!" log on Logseq Web, but we still fall through cleanly.
 *   (2) `fetch(url)` — fallback for Logseq Web where `makeUrl` returns
 *       a `blob:` URL the renderer can read directly.
 *   (3) `<img>` → canvas → `toDataURL` — last-resort fallback.
 *
 * If every path fails, `describeOriginMismatch` adds a hint pointing
 * the user at filesystem-load when the failure looks like an HMR
 * origin/scheme cross.
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

  const ipc = await tryLogseqRequestAsBase64(url, mimeType);
  if (ipc.ok) return ipc;

  const fetched = await tryFetchAsDataUrl(url, mimeType);
  if (fetched.ok) return fetched;

  const canvased = await tryCanvasAsDataUrl(url, mimeType);
  if (canvased.ok) return canvased;

  const reason: LoadAssetFailure =
    canvased.reason === "decode-failed" ? "decode-failed" : "fetch-failed";
  const hint = describeOriginMismatch(window.location.origin, url) ?? undefined;
  return hint ? { ok: false, reason, hint } : { ok: false, reason };
}

async function tryLogseqRequestAsBase64(
  url: string,
  mimeType: string,
): Promise<LoadImageAssetResult> {
  const req = (logseq as { Request?: { _request?: (opts: unknown) => Promise<unknown> } }).Request;
  if (!req?._request) {
    console.warn("[ai-actions] image-loader: logseq.Request._request unavailable");
    return { ok: false, reason: "fetch-failed" };
  }
  try {
    const result = await req._request({ url, method: "GET", returnType: "base64" });
    const base64 = extractRequestBase64(result);
    if (!base64) {
      console.warn(
        "[ai-actions] image-loader: _request returned unparseable payload",
        typeof result,
        result,
      );
      return { ok: false, reason: "decode-failed" };
    }
    console.warn("[ai-actions] image-loader: IPC path succeeded");
    return { ok: true, mimeType, base64 };
  } catch (err) {
    console.warn("[ai-actions] image-loader: _request threw — falling back", err);
    return { ok: false, reason: "fetch-failed" };
  }
}

async function tryFetchAsDataUrl(url: string, mimeType: string): Promise<LoadImageAssetResult> {
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return { ok: false, reason: "fetch-failed" };
  const blob = await res.blob().catch(() => null);
  if (!blob) return { ok: false, reason: "fetch-failed" };
  const dataUrl = await blobToDataUrl(blob);
  if (!dataUrl) return { ok: false, reason: "decode-failed" };
  const base64 = stripDataUrlPrefix(dataUrl);
  return base64 ? { ok: true, mimeType, base64 } : { ok: false, reason: "decode-failed" };
}

async function tryCanvasAsDataUrl(url: string, mimeType: string): Promise<LoadImageAssetResult> {
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
