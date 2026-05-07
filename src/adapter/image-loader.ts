/// <reference types="@logseq/libs" />

import { describeOriginMismatch, type LoadAssetFailure } from "../asset-url";
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
 *
 *   (1) postMessage → `apis.doAction(['readFileRaw', path])` — primary on
 *       Desktop. Reads the file via Node's `fs.readFileSync` in the main
 *       process and returns a Buffer. We get bytes back via the Postmate
 *       caller (cross-origin-safe). Why not the SDK's `Request._request`?
 *       It uses `Experiments.invokeExperMethod` which synchronously reads
 *       `parent.window.logseq` — that throws `SecurityError` because the
 *       plugin iframe (`lsp://logseq.io/...`) is cross-origin with the
 *       Logseq main window. Why not `:httpRequest` (the same handler
 *       Request._request would hit)? It uses node-fetch 3.x which does
 *       NOT accept `file://` URLs (`URL scheme "file" is not supported`).
 *       `:readFileRaw` is registered in
 *       `logseq/src/electron/electron/handler.cljs:88` and uses
 *       `fs.readFileSync` directly — bypasses node-fetch.
 *
 *       Path: `_execCallableAPIAsync('doAction', ['readFileRaw', path])`.
 *       The `safeSnakeCase` lookup chain in
 *       `logseq/libs/src/common.ts:invokeHostExportedApi` resolves
 *       `'doAction'` to `window.apis.doAction` on the host (since
 *       `logseq.api.doAction` doesn't exist). `apis.doAction(arg)` calls
 *       `ipcRenderer.invoke('main', arg)`, which the main-process
 *       dispatcher routes to `defmethod handle :readFileRaw`. The
 *       returned Buffer flows back through Electron IPC and Postmate
 *       structured-clone; we Blob/FileReader it to base64.
 *
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

  const ipc = await tryReadFileRawIPC(url, mimeType);
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

type SDKInternals = {
  _execCallableAPIAsync?: (method: string, ...args: unknown[]) => Promise<unknown>;
};

async function tryReadFileRawIPC(url: string, mimeType: string): Promise<LoadImageAssetResult> {
  const ctx = logseq as unknown as SDKInternals;
  const exec = ctx._execCallableAPIAsync?.bind(ctx);
  if (!exec) {
    console.warn("[ai-actions] image-loader: _execCallableAPIAsync unavailable");
    return { ok: false, reason: "fetch-failed" };
  }

  const fsPath = fileUrlToPath(url);
  if (!fsPath) {
    console.warn("[ai-actions] image-loader: not a file:// URL, skipping IPC", url);
    return { ok: false, reason: "fetch-failed" };
  }

  let raw: unknown;
  try {
    // No leading colon — host dispatcher does `(keyword (first args))` and
    // `(keyword ":readFileRaw")` in ClojureScript yields a keyword whose
    // name is `":readFileRaw"`, not `:readFileRaw`. The SDK's own internals
    // (`apis.doAction(["readFile", path])`) follow the same convention.
    raw = await exec("doAction", ["readFileRaw", fsPath]);
  } catch (err) {
    console.warn("[ai-actions] image-loader: readFileRaw IPC threw", err);
    return { ok: false, reason: "fetch-failed" };
  }

  const bytes = toUint8Array(raw);
  if (!bytes || bytes.length === 0) {
    console.warn(
      "[ai-actions] image-loader: readFileRaw returned non-bytes payload",
      typeof raw,
      raw,
    );
    return { ok: false, reason: "decode-failed" };
  }

  // Copy into a fresh ArrayBuffer — Blob's BlobPart type rejects
  // Uint8Array<ArrayBufferLike> under TS lib.dom 2025+ even though the
  // bytes are identical at runtime.
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const dataUrl = await blobToDataUrl(new Blob([buf]));
  if (!dataUrl) return { ok: false, reason: "decode-failed" };
  const base64 = stripDataUrlPrefix(dataUrl);
  if (!base64) return { ok: false, reason: "decode-failed" };

  console.warn(`[ai-actions] image-loader: readFileRaw IPC succeeded (${bytes.length} bytes)`);
  return { ok: true, mimeType, base64 };
}

/**
 * Strip `file://` and decode percent-escapes to a filesystem path. Returns
 * null when the URL isn't `file://` (e.g. `blob:` on Logseq Web). Handles
 * Windows-style `file:///C:/...` by dropping the leading slash before the
 * drive letter.
 */
function fileUrlToPath(url: string): string | null {
  if (!url.startsWith("file://")) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  let p = decodeURIComponent(parsed.pathname);
  if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
  return p;
}

function toUint8Array(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (
    typeof ArrayBuffer !== "undefined" &&
    Object.prototype.toString.call(value) === "[object ArrayBuffer]"
  ) {
    return new Uint8Array(value as Uint8Array);
  }
  // Node Buffer over IPC may surface as { type: "Buffer", data: number[] }
  // in some serialisation paths. Defensive check.
  const obj = value as { type?: unknown; data?: unknown };
  if (obj?.type === "Buffer" && Array.isArray(obj.data)) {
    return new Uint8Array(obj.data as number[]);
  }
  return null;
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
