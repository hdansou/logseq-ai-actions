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
 *   (1) postMessage IPC via `_execCallableAPIAsync("exper_request", ...)` —
 *       primary on Desktop. The plugin iframe runs at `lsp://logseq.io/...`
 *       and is cross-origin with the Logseq main window, so any
 *       synchronous `parent.window.logseq.…` access (including
 *       `logseq.Request._request`, which uses
 *       `Experiments.invokeExperMethod` → `ensureHostScope`) blows up
 *       with `SecurityError: Blocked a frame with origin "lsp://logseq.io"
 *       from accessing a cross-origin frame`. The Postmate-based caller
 *       (see logseq/libs/src/LSPlugin.caller.ts) uses postMessage which
 *       IS cross-origin-safe, and the host's `:exper_request` ^:export
 *       fires the same `:httpRequest` IPC handler that
 *       `Request._request` would. Response arrives via the host's
 *       `request-callback` → `#lsp#request#callback` postMessage event.
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

  const ipc = await tryPostmateExperRequestBase64(url, mimeType);
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
  baseInfo?: { id?: string };
  _execCallableAPIAsync?: (method: string, ...args: unknown[]) => Promise<unknown>;
  caller?: {
    on: (type: string, fn: (payload: unknown) => void) => void;
    off: (type: string, fn: (payload: unknown) => void) => void;
  };
};

const REQUEST_CALLBACK_EVENT = "#lsp#request#callback";
const IPC_TIMEOUT_MS = 30_000;

async function tryPostmateExperRequestBase64(
  url: string,
  mimeType: string,
): Promise<LoadImageAssetResult> {
  const ctx = logseq as unknown as SDKInternals;
  const exec = ctx._execCallableAPIAsync?.bind(ctx);
  const caller = ctx.caller;
  const pluginId = ctx.baseInfo?.id;

  if (!exec || !caller || !pluginId) {
    console.warn("[ai-actions] image-loader: postMessage IPC unavailable", {
      hasExec: !!exec,
      hasCaller: !!caller,
      hasPluginId: !!pluginId,
    });
    return { ok: false, reason: "fetch-failed" };
  }

  try {
    const result = await runExperRequest(exec, caller, pluginId, url);
    const base64 = extractRequestBase64(result);
    if (!base64) {
      console.warn(
        "[ai-actions] image-loader: exper_request returned unparseable payload",
        typeof result,
        result,
      );
      return { ok: false, reason: "decode-failed" };
    }
    console.warn("[ai-actions] image-loader: postMessage IPC succeeded");
    return { ok: true, mimeType, base64 };
  } catch (err) {
    console.warn("[ai-actions] image-loader: postMessage IPC failed — falling back", err);
    return { ok: false, reason: "fetch-failed" };
  }
}

function runExperRequest(
  exec: (method: string, ...args: unknown[]) => Promise<unknown>,
  caller: NonNullable<SDKInternals["caller"]>,
  pluginId: string,
  url: string,
): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    const buffered = new Map<unknown, unknown>();
    let reqId: unknown = null;
    let done = false;

    const finish = (err: Error | null, payload?: unknown) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      caller.off(REQUEST_CALLBACK_EVENT, listener);
      if (err) reject(err);
      else resolve(payload);
    };

    const listener = (e: unknown) => {
      const p = e as { requestId?: unknown; payload?: unknown };
      if (p?.requestId == null) return;
      if (reqId !== null && p.requestId === reqId) {
        finish(null, p.payload);
      } else {
        // Response may arrive between exec resolving and our .then setting
        // reqId; buffer until we know which id is ours.
        buffered.set(p.requestId, p.payload);
      }
    };

    const timer = setTimeout(() => finish(new Error("exper_request timed out")), IPC_TIMEOUT_MS);

    caller.on(REQUEST_CALLBACK_EVENT, listener);

    exec("exper_request", pluginId, { url, method: "GET", returnType: "base64" })
      .then((id) => {
        reqId = id;
        if (buffered.has(id)) finish(null, buffered.get(id));
      })
      .catch((err) => finish(err instanceof Error ? err : new Error(String(err))));
  });
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
