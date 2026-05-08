import { describe, expect, it } from "vitest";
import { fileUrlToPath, toUint8Array } from "./image-loader";

describe("toUint8Array", () => {
  it("passes a Uint8Array through unchanged", () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(toUint8Array(bytes)).toBe(bytes);
  });

  it("wraps an ArrayBuffer as a Uint8Array view", () => {
    const buf = new Uint8Array([1, 2, 3]).buffer;
    const out = toUint8Array(buf);
    expect(out).toBeInstanceOf(Uint8Array);
    expect(Array.from(out ?? [])).toEqual([1, 2, 3]);
  });

  it("decodes a Node-Buffer envelope `{type:'Buffer',data:[…]}`", () => {
    const out = toUint8Array({ type: "Buffer", data: [9, 8, 7] });
    expect(out).toEqual(new Uint8Array([9, 8, 7]));
  });

  // Regression guard: without the trailing `js-obj` flag on the IPC call,
  // Logseq's `set-ipc-handler!` returns a transit-cljs string of the form
  // `["~#'", "~b<base64>"]` instead of bytes. Asserting null here pins the
  // contract that strings are not silently treated as bytes — if `js-obj`
  // ever gets dropped, the warn path in `tryReadFileRawIPC` fires.
  it("rejects a transit-encoded string", () => {
    const transit = '["~#\'","~biVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAA"]';
    expect(toUint8Array(transit)).toBeNull();
  });

  it.each([null, undefined, "", 0, {}, []])("rejects %s", (value) => {
    expect(toUint8Array(value)).toBeNull();
  });
});

describe("fileUrlToPath", () => {
  it("strips the file:// prefix", () => {
    expect(fileUrlToPath("file:///Users/me/asset.png")).toBe("/Users/me/asset.png");
  });

  it("decodes percent-escapes in the path", () => {
    expect(fileUrlToPath("file:///Users/me/asset%20with%20space.png")).toBe(
      "/Users/me/asset with space.png",
    );
  });

  it("normalises Windows drive-letter paths by dropping the leading slash", () => {
    expect(fileUrlToPath("file:///C:/Users/me/asset.png")).toBe("C:/Users/me/asset.png");
  });

  it("returns null for non-file URLs (Logseq Web blob:, http:)", () => {
    expect(fileUrlToPath("blob:https://logseq.io/abc")).toBeNull();
    expect(fileUrlToPath("https://example.com/asset.png")).toBeNull();
    expect(fileUrlToPath("")).toBeNull();
  });
});
