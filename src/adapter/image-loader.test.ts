import { afterEach, describe, expect, it, vi } from "vitest";
import { assetUrlToFsPath, toUint8Array } from "./image-loader";

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

describe("assetUrlToFsPath", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("strips the file:// prefix", () => {
    expect(assetUrlToFsPath("file:///Users/me/asset.png")).toBe("/Users/me/asset.png");
  });

  it("decodes percent-escapes in the path", () => {
    expect(assetUrlToFsPath("file:///Users/me/asset%20with%20space.png")).toBe(
      "/Users/me/asset with space.png",
    );
  });

  it("normalises Windows drive-letter paths by dropping the leading slash", () => {
    expect(assetUrlToFsPath("file:///C:/Users/me/asset.png")).toBe("C:/Users/me/asset.png");
  });

  it("accepts Logseq Desktop's assets:// scheme, which carries an absolute path", () => {
    expect(
      assetUrlToFsPath(
        "assets:///Users/me/graphs/G/assets/6ac112c0-fed5-48bf-b881-87085e68a4f6.png",
      ),
    ).toBe("/Users/me/graphs/G/assets/6ac112c0-fed5-48bf-b881-87085e68a4f6.png");
  });

  it("decodes percent-escapes in assets:// paths", () => {
    expect(assetUrlToFsPath("assets:///Users/me/my%20graph/assets/a%20b.png")).toBe(
      "/Users/me/my graph/assets/a b.png",
    );
  });

  it("undoes the host's protected drive colon in Windows assets:// paths", () => {
    expect(assetUrlToFsPath("assets:///C/logseq__colon/Users/me/assets/a.png")).toBe(
      "C:/Users/me/assets/a.png",
    );
  });

  it("does not depend on URL parsing: Chromium treats assets:// as a standard scheme", () => {
    // In Logseq's renderer `assets:///Users/me/x.png` parses with host "users"
    // (lowercased) and path "/me/x.png". Node parses it with an empty host.
    class ChromiumStandardSchemeURL {
      hostname: string;
      pathname: string;
      constructor(url: string) {
        const m = /^assets:\/\/\/([^/]+)(\/.*)?$/.exec(url);
        if (!m) throw new TypeError("Invalid URL");
        this.hostname = (m[1] ?? "").toLowerCase();
        this.pathname = m[2] ?? "/";
      }
    }
    vi.stubGlobal("URL", ChromiumStandardSchemeURL);
    expect(assetUrlToFsPath("assets:///Users/me/graphs/G/assets/a.png")).toBe(
      "/Users/me/graphs/G/assets/a.png",
    );
  });

  it("returns null for assets:// URLs with a host part (Windows UNC), leaving them to the fallbacks", () => {
    expect(assetUrlToFsPath("assets://server/share/assets/a.png")).toBeNull();
  });

  it("returns null for non-file URLs (Logseq Web blob:, http:)", () => {
    expect(assetUrlToFsPath("blob:https://logseq.io/abc")).toBeNull();
    expect(assetUrlToFsPath("https://example.com/asset.png")).toBeNull();
    expect(assetUrlToFsPath("")).toBeNull();
  });
});
