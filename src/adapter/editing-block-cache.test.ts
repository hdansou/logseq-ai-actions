import { describe, expect, it } from "vitest";
import { isCacheFresh } from "./editing-block-cache";

describe("isCacheFresh", () => {
  const STALE_MS = 10_000;

  it("returns false when the cache has never been populated", () => {
    expect(isCacheFresh(0, 1_700_000_000_000, STALE_MS)).toBe(false);
  });

  it("returns true when the cache was populated within the freshness window", () => {
    const now = 1_700_000_000_000;
    expect(isCacheFresh(now - 1_000, now, STALE_MS)).toBe(true);
    expect(isCacheFresh(now - (STALE_MS - 1), now, STALE_MS)).toBe(true);
  });

  it("returns false when the cache has aged past the freshness window", () => {
    const now = 1_700_000_000_000;
    expect(isCacheFresh(now - STALE_MS, now, STALE_MS)).toBe(false);
    expect(isCacheFresh(now - (STALE_MS + 1), now, STALE_MS)).toBe(false);
  });
});
