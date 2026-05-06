/**
 * Pure helpers for diagnosing why a Logseq asset URL could not be turned into
 * raw bytes. Lives outside `src/adapter/` because it has no SDK dependency —
 * the adapter calls these to translate low-level failures into user-facing
 * toast text.
 */

export type LoadAssetFailure =
  | "no-path"
  | "no-type"
  | "unsupported-mime"
  | "makeurl-failed"
  | "fetch-failed"
  | "decode-failed";

const MESSAGES: Readonly<Record<LoadAssetFailure, string>> = {
  "no-path": "Could not resolve the asset path on this block.",
  "no-type": "Asset type is missing on this block.",
  "unsupported-mime": "This file is not a supported image type (PNG, JPEG, GIF, or WebP).",
  "makeurl-failed": "Could not build a URL for the asset file.",
  "fetch-failed": "Could not read the image bytes from disk.",
  "decode-failed": "Could not decode the image bytes.",
};

/**
 * Map a failure reason to user-facing toast text. When `hint` is supplied it
 * is appended on its own line so the toast can render a short why + a longer
 * what-to-try without forcing the caller to assemble the string.
 */
export function failureMessage(reason: LoadAssetFailure, hint?: string): string {
  const base = MESSAGES[reason];
  return hint ? `${base}\n${hint}` : base;
}

const ORIGIN_HINT =
  "Vision actions need a filesystem-load plugin install. In dev, use `pnpm build:watch` and side-load the `dist/` folder; in production, install from the marketplace.";

/**
 * Detect the dev-mode origin/scheme cross that prevents `fetch()` from reading
 * an asset file: plugin loaded from `http(s)://` but `logseq.Assets.makeUrl`
 * returned `file://`. Chromium blocks this with "Not allowed to load local
 * resource" and there is no SDK route around it. Returns the user-facing hint
 * when the cross is detected, `null` otherwise.
 */
export function describeOriginMismatch(origin: string, url: string): string | null {
  if (!origin || !url) return null;
  const httpOrigin = origin.startsWith("http://") || origin.startsWith("https://");
  const fileUrl = url.startsWith("file://");
  return httpOrigin && fileUrl ? ORIGIN_HINT : null;
}

/**
 * Normalise the response from `logseq.Request._request({ returnType: "base64" })`
 * into a clean base64 string. The Electron handler returns a raw base64 string
 * (`logseq/src/electron/electron/handler.cljs:376-379`), but the SDK wrapper
 * occasionally nests payloads under `{ data }` — host-scope.ts handles both
 * shapes for HTTP and we mirror that here. Strips a leading `data:…;base64,`
 * prefix defensively in case a future host build changes shape.
 *
 * Returns the base64 string on success, or `null` if the payload is missing,
 * empty, or not a string. Pure — no DOM, no SDK access — so it can be unit
 * tested without jsdom.
 */
export function extractRequestBase64(result: unknown): string | null {
  const raw =
    typeof result === "string"
      ? result
      : typeof (result as { data?: unknown })?.data === "string"
        ? (result as { data: string }).data
        : null;
  if (!raw) return null;
  const commaIdx = raw.startsWith("data:") ? raw.indexOf(",") : -1;
  const base64 = commaIdx === -1 ? raw : raw.slice(commaIdx + 1);
  return base64.length > 0 ? base64 : null;
}
