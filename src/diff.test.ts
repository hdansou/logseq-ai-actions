import { describe, expect, it } from "vitest";
import { computeDiff, type DiffSegment } from "./diff";

describe("computeDiff", () => {
  it("returns a single 'same' segment when texts are identical", () => {
    const segments = computeDiff("hello world", "hello world");
    expect(segments).toEqual<DiffSegment[]>([{ kind: "same", value: "hello world" }]);
  });

  it("returns a single 'added' segment for pure insertion (empty original)", () => {
    const segments = computeDiff("", "new content");
    expect(segments).toEqual<DiffSegment[]>([{ kind: "added", value: "new content" }]);
  });

  it("returns a single 'removed' segment for pure deletion (empty proposed)", () => {
    const segments = computeDiff("old content", "");
    expect(segments).toEqual<DiffSegment[]>([{ kind: "removed", value: "old content" }]);
  });

  it("interleaves same/removed/added segments for a mixed edit", () => {
    // "their are" → "there are" — "their" removed, "there" added.
    const segments = computeDiff("Their are issues.", "There are issues.");
    // Assert the kinds form the expected sequence (values checked separately
    // since exact whitespace segmentation depends on jsdiff internals).
    expect(segments.map((s) => s.kind)).toEqual(["removed", "added", "same"]);
    // The same-segment must carry the surviving content.
    expect(segments[segments.length - 1]?.value).toContain("are issues");
  });

  it("never returns a segment with empty value", () => {
    for (const pair of [
      ["", ""],
      ["abc", "abc"],
      ["", "abc"],
      ["abc", ""],
      ["the quick brown fox", "the quick red fox"],
    ] as const) {
      for (const seg of computeDiff(pair[0], pair[1])) {
        expect(seg.value.length).toBeGreaterThan(0);
      }
    }
  });

  it("concatenating added + same yields the proposed text (minus whitespace edge cases)", () => {
    const original = "alpha beta gamma";
    const proposed = "alpha DELTA gamma";
    const segments = computeDiff(original, proposed);
    // Filter to segments visible on the "proposed" side: same + added.
    const reconstructed = segments
      .filter((s) => s.kind !== "removed")
      .map((s) => s.value)
      .join("");
    expect(reconstructed).toBe(proposed);
  });

  it("concatenating removed + same yields the original text", () => {
    const original = "alpha beta gamma";
    const proposed = "alpha DELTA gamma";
    const segments = computeDiff(original, proposed);
    const reconstructed = segments
      .filter((s) => s.kind !== "added")
      .map((s) => s.value)
      .join("");
    expect(reconstructed).toBe(original);
  });
});
