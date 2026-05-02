/// <reference types="@logseq/libs" />

/**
 * Lightweight tracker that remembers which block the user was last
 * editing. The toolbar entry point reads this on click because the act
 * of clicking the toolbar blurs the editor — by the time
 * `openActionPicker` runs, `checkEditing()` and `getCurrentBlock()` both
 * return null/false even when the user clearly had a block focused a
 * moment ago.
 *
 * Implementation: poll `checkEditing()` every 500 ms (one postMessage,
 * negligible cost) and cache any non-null UUID with a timestamp. Cache
 * is invalidated after `STALE_MS` so we never act on a UUID the user
 * has long since left, and on `onRouteChanged` so navigating to another
 * page never inherits the previous page's last-edited block.
 *
 * The pure `isCacheFresh` helper is the testable part; the rest is a
 * thin wrapper over Logseq's editor APIs.
 */

const POLL_MS = 500;
const STALE_MS = 10_000;

let cachedUuid: string | null = null;
let cachedAt = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Pure freshness check. Returns false when the cache has never been
 * populated (`cachedAt === 0`) or when the cache is older than
 * `staleMs`.
 */
export function isCacheFresh(cachedAt: number, now: number, staleMs: number): boolean {
  if (cachedAt === 0) return false;
  return now - cachedAt < staleMs;
}

/**
 * Three-tier probe of the current editing/selection state. Tries
 * `checkEditing` (most specific), falls back to `getCurrentBlock`
 * (cursor-anywhere), then `getSelectedBlocks` (block selected via
 * bullet click). Returns the first UUID it finds, or null.
 */
export async function probeFocusedBlockNow(): Promise<string | null> {
  try {
    const editing = await logseq.Editor.checkEditing();
    if (typeof editing === "string" && editing) return editing;
  } catch {
    /* SDK blip — fall through */
  }
  try {
    const current = await logseq.Editor.getCurrentBlock();
    if (current?.uuid) return current.uuid;
  } catch {
    /* fall through */
  }
  try {
    const selected = await logseq.Editor.getSelectedBlocks();
    if (selected && selected.length > 0 && selected[0]?.uuid) return selected[0].uuid;
  } catch {
    /* fall through */
  }
  return null;
}

/** Cached UUID if still within `STALE_MS`, otherwise null. */
export function getCachedEditingBlockUuid(): string | null {
  return isCacheFresh(cachedAt, Date.now(), STALE_MS) ? cachedUuid : null;
}

/**
 * Start the polling loop and the route-change invalidator. Idempotent —
 * calling twice is a no-op so re-registration after a hot-reload is
 * safe.
 */
export function startEditingBlockTracker(): void {
  if (pollTimer !== null) return;
  pollTimer = setInterval(() => {
    void (async () => {
      const uuid = await probeFocusedBlockNow();
      if (uuid) {
        cachedUuid = uuid;
        cachedAt = Date.now();
      }
    })();
  }, POLL_MS);
  logseq.App.onRouteChanged(() => {
    cachedUuid = null;
    cachedAt = 0;
  });
}
