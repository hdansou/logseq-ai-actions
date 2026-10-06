import { describe, expect, it } from "vitest";
import { buildDebugEntry, createRingBuffer, PREVIEW_TRUNCATION_LIMIT, truncate } from "./debug-log";

describe("createRingBuffer", () => {
  it("throws on a non-positive integer capacity", () => {
    expect(() => createRingBuffer<number>(0)).toThrow();
    expect(() => createRingBuffer<number>(-1)).toThrow();
    expect(() => createRingBuffer<number>(1.5)).toThrow();
    expect(() => createRingBuffer<number>(Number.NaN)).toThrow();
  });

  it("stores entries up to capacity", () => {
    const rb = createRingBuffer<number>(3);
    rb.push(1);
    rb.push(2);
    expect(rb.entries()).toEqual([1, 2]);
  });

  it("evicts the oldest entry on overflow", () => {
    const rb = createRingBuffer<number>(3);
    rb.push(1);
    rb.push(2);
    rb.push(3);
    rb.push(4);
    rb.push(5);
    expect(rb.entries()).toEqual([3, 4, 5]);
  });

  it("returns entries in chronological order (oldest → newest)", () => {
    const rb = createRingBuffer<string>(5);
    rb.push("a");
    rb.push("b");
    rb.push("c");
    expect(rb.entries()).toEqual(["a", "b", "c"]);
  });

  it("entries() returns a defensive copy — callers cannot mutate the buffer", () => {
    const rb = createRingBuffer<number>(3);
    rb.push(1);
    rb.push(2);
    const view = rb.entries() as number[];
    view.push(99);
    expect(rb.entries()).toEqual([1, 2]); // unchanged
  });

  it("clear() empties the buffer", () => {
    const rb = createRingBuffer<number>(3);
    rb.push(1);
    rb.push(2);
    rb.clear();
    expect(rb.entries()).toEqual([]);
  });

  it("capacity is surfaced on the returned object", () => {
    expect(createRingBuffer<number>(7).capacity).toBe(7);
  });
});

describe("truncate", () => {
  it("returns the string unchanged when under the limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("returns the string unchanged at the exact limit", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates with an ellipsis and remaining-character count", () => {
    const result = truncate("abcdefghij", 5);
    expect(result.startsWith("abcde")).toBe(true);
    expect(result).toContain("…");
    expect(result).toContain("5 more");
  });

  it("handles the empty string", () => {
    expect(truncate("", 10)).toBe("");
  });
});

describe("buildDebugEntry", () => {
  const action = {
    id: "grammar",
    title: "Grammar",
    scope: "block",
    outputMode: "replace",
  } as const;
  const base = {
    action,
    model: "m",
    baseUrl: "http://user:s3cret@192.168.1.5:8888/v1",
    request: "x".repeat(PREVIEW_TRUNCATION_LIMIT + 10),
    startedAt: 1_000,
    now: 1_250,
  };

  it("builds the entry with redacted URL, truncated request, and duration", () => {
    const entry = buildDebugEntry({ ...base, output: "y".repeat(PREVIEW_TRUNCATION_LIMIT + 3) });

    expect(entry).toMatchObject({
      timestamp: 1_000,
      actionId: "grammar",
      actionTitle: "Grammar",
      scope: "block",
      outputMode: "replace",
      model: "m",
      baseUrl: "http://192.168.1.5:8888/v1",
      durationMs: 250,
    });
    expect(entry.requestPreview).toBe(truncate(base.request, PREVIEW_TRUNCATION_LIMIT));
    expect(entry.responsePreview).toMatch(/… \[3 more chars\]$/);
    expect(entry).not.toHaveProperty("error");
  });

  it("records the error and omits the response when the call failed", () => {
    const entry = buildDebugEntry({ ...base, error: "HTTP 401" });

    expect(entry.error).toBe("HTTP 401");
    expect(entry).not.toHaveProperty("responsePreview");
  });
});
