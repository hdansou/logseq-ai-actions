import { describe, expect, it, vi } from "vitest";
import { copyText } from "./copy-text";

describe("copyText", () => {
  it("uses the async clipboard API when it works", async () => {
    const writeText = vi.fn(async () => {});
    const execCopy = vi.fn(() => true);
    expect(await copyText("hello", { writeText, execCopy })).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
    expect(execCopy).not.toHaveBeenCalled();
  });

  // The plugin runs in a cross-origin iframe; without a clipboard-write
  // permission policy the async API rejects.
  it("falls back to execCommand copy when the clipboard API rejects or is missing", async () => {
    const execCopy = vi.fn(() => true);
    const writeText = vi.fn(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    expect(await copyText("hello", { writeText, execCopy })).toBe(true);
    expect(execCopy).toHaveBeenCalledWith("hello");
    expect(await copyText("hi", { execCopy })).toBe(true);
  });

  it("reports failure when neither way copies", async () => {
    expect(await copyText("hello", { execCopy: () => false })).toBe(false);
    expect(
      await copyText("hello", {
        execCopy: () => {
          throw new Error("no document");
        },
      }),
    ).toBe(false);
  });
});
