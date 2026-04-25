import { describe, expect, it } from "vitest";
import {
  type AssetBlock,
  assetFilePath,
  getAssetType,
  imageMimeType,
  isImageAsset,
  RASTER_IMAGE_TYPES,
} from "./image-asset";

describe("getAssetType", () => {
  it("reads a top-level key without leading colon", () => {
    expect(getAssetType({ "logseq.property.asset/type": "png" })).toBe("png");
  });

  it("reads a top-level key WITH leading colon (Logseq variant)", () => {
    expect(getAssetType({ ":logseq.property.asset/type": "jpg" })).toBe("jpg");
  });

  it("reads from nested properties bag", () => {
    expect(
      getAssetType({ properties: { "logseq.property.asset/type": "webp" } } as AssetBlock),
    ).toBe("webp");
  });

  it("falls back to any key ending in 'asset/type'", () => {
    // Defensive: SDK serialisations sometimes namespace things differently.
    const block = { "weird-prefix.asset/type": "gif" } as unknown as AssetBlock;
    expect(getAssetType(block)).toBe("gif");
  });

  it("returns undefined when no asset/type key present anywhere", () => {
    expect(getAssetType({ uuid: "abc" } as AssetBlock)).toBeUndefined();
  });

  it("ignores non-string values for safety", () => {
    expect(
      getAssetType({ "logseq.property.asset/type": 42 } as unknown as AssetBlock),
    ).toBeUndefined();
  });
});

describe("isImageAsset", () => {
  // The presence of `logseq.property.asset/type` is the canonical signal —
  // see image-asset.ts for the rationale. Tests therefore set that
  // property and (deliberately) do NOT depend on tag membership shape.
  const mkAsset = (type: string): AssetBlock => ({
    uuid: "11111111-1111-1111-1111-111111111111",
    "logseq.property.asset/type": type,
  });

  it.each([...RASTER_IMAGE_TYPES])("recognises %s as a raster image", (type) => {
    expect(isImageAsset(mkAsset(type))).toBe(true);
  });

  it("rejects pdf, mp3, txt and other non-image asset types", () => {
    for (const type of ["pdf", "mp3", "txt", "zip", "mp4"]) {
      expect(isImageAsset(mkAsset(type))).toBe(false);
    }
  });

  it("excludes svg in v1 (vector — not what raster vision models accept)", () => {
    expect(isImageAsset(mkAsset("svg"))).toBe(false);
  });

  it("rejects a block with no asset/type", () => {
    expect(isImageAsset({ uuid: "11111111-1111-1111-1111-111111111111" })).toBe(false);
  });

  it("normalises uppercase asset/type to lowercase before matching", () => {
    expect(isImageAsset(mkAsset("PNG"))).toBe(true);
    expect(isImageAsset(mkAsset("JPEG"))).toBe(true);
  });

  it("recognises a block whose asset/type lives under the leading-colon key", () => {
    expect(
      isImageAsset({
        uuid: "11111111-1111-1111-1111-111111111111",
        ":logseq.property.asset/type": "png",
      }),
    ).toBe(true);
  });

  it("recognises a block whose asset/type lives in the nested properties bag", () => {
    expect(
      isImageAsset({
        uuid: "11111111-1111-1111-1111-111111111111",
        properties: { "logseq.property.asset/type": "webp" },
      } as AssetBlock),
    ).toBe(true);
  });
});

describe("imageMimeType", () => {
  it.each([
    ["png", "image/png"],
    ["jpg", "image/jpeg"],
    ["jpeg", "image/jpeg"],
    ["gif", "image/gif"],
    ["webp", "image/webp"],
  ])("maps %s -> %s", (ext, mime) => {
    expect(imageMimeType(ext)).toBe(mime);
  });

  it("normalises uppercase extensions", () => {
    expect(imageMimeType("PNG")).toBe("image/png");
  });

  it("returns undefined for unknown extensions", () => {
    expect(imageMimeType("svg")).toBeUndefined();
    expect(imageMimeType("pdf")).toBeUndefined();
    expect(imageMimeType("")).toBeUndefined();
  });
});

describe("assetFilePath", () => {
  it("constructs assets/<uuid>.<ext> from a block", () => {
    expect(
      assetFilePath({
        uuid: "abcd1234-ef56-7890-abcd-1234567890ab",
        "logseq.property.asset/type": "png",
      }),
    ).toBe("assets/abcd1234-ef56-7890-abcd-1234567890ab.png");
  });

  it("lowercases the extension so we don't end up with foo.PNG when the SDK upper-cases it", () => {
    expect(
      assetFilePath({
        uuid: "abcd1234-ef56-7890-abcd-1234567890ab",
        "logseq.property.asset/type": "PNG",
      }),
    ).toBe("assets/abcd1234-ef56-7890-abcd-1234567890ab.png");
  });

  it("returns null when uuid is missing", () => {
    expect(
      assetFilePath({ "logseq.property.asset/type": "png" } as unknown as AssetBlock),
    ).toBeNull();
  });

  it("returns null when asset/type is missing", () => {
    expect(assetFilePath({ uuid: "abc" } as AssetBlock)).toBeNull();
  });
});
