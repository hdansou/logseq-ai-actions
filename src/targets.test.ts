import { describe, expect, it } from "vitest";
import { collectTargets, MAX_TARGETS, skipReason, type TargetNode } from "./targets";

const n = (uuid: string, title: string, children?: TargetNode[], extra = {}): TargetNode => ({
  uuid,
  title,
  ...(children ? { children } : {}),
  ...extra,
});

describe("collectTargets", () => {
  it("walks the trees in document order, recording depth", () => {
    const roots = [n("a", "A", [n("a1", "A1", [n("a1x", "A1x")]), n("a2", "A2")]), n("b", "B")];
    expect(collectTargets(roots).targets).toEqual([
      { uuid: "a", text: "A", depth: 0 },
      { uuid: "a1", text: "A1", depth: 1 },
      { uuid: "a1x", text: "A1x", depth: 2 },
      { uuid: "a2", text: "A2", depth: 1 },
      { uuid: "b", text: "B", depth: 0 },
    ]);
  });

  it("keeps a block once when a selection holds both a parent and its child", () => {
    const child = n("c", "Child");
    const { targets } = collectTargets([n("p", "Parent", [child]), child]);
    expect(targets.map((t) => t.uuid)).toEqual(["p", "c"]);
  });

  it("skips ineligible blocks but still walks their children, and counts what it skipped", () => {
    const roots = [n("e", "   ", [n("e1", "Under an empty parent")]), n("k", "Keep")];
    const out = collectTargets(roots);
    expect(out.targets.map((t) => t.uuid)).toEqual(["e1", "k"]);
    expect(out.skipped).toBe(1);
  });

  it("trims block text", () => {
    expect(collectTargets([n("a", "  Hello  ")]).targets[0]?.text).toBe("Hello");
  });

  it("caps runs at 50 blocks", () => {
    expect(MAX_TARGETS).toBe(50);
  });
});

describe("skipReason", () => {
  it("keeps ordinary text blocks", () => {
    expect(skipReason(n("a", "Plain text with #tag and [[Page]]"))).toBeNull();
  });

  it("skips empty blocks", () => {
    expect(skipReason(n("a", ""))).toBe("empty");
    expect(skipReason({ uuid: "a" })).toBe("empty");
  });

  it("skips image / asset blocks (any asset/type key shape)", () => {
    expect(skipReason(n("a", "photo", undefined, { "logseq.property.asset/type": "png" }))).toBe(
      "asset",
    );
    expect(skipReason(n("a", "doc", undefined, { ":logseq.property.asset/type": "pdf" }))).toBe(
      "asset",
    );
  });

  it("skips code and math blocks by display type, with or without a leading colon", () => {
    expect(
      skipReason(n("a", "x()", undefined, { "logseq.property.node/display-type": "code" })),
    ).toBe("code");
    expect(
      skipReason(n("a", "e=mc^2", undefined, { ":logseq.property.node/display-type": ":math" })),
    ).toBe("math");
  });

  it("skips code and math blocks recognisable from their text alone", () => {
    expect(skipReason(n("a", "```js\nx()\n```"))).toBe("code");
    expect(skipReason(n("a", "$$e=mc^2$$"))).toBe("math");
  });

  it("skips query blocks and embeds", () => {
    expect(
      skipReason(n("a", "Open tasks", undefined, { "logseq.property/query": "(task todo)" })),
    ).toBe("query");
    expect(skipReason(n("a", "", undefined, { link: { id: 42 } }))).toBe("embed");
    expect(skipReason(n("a", "x", undefined, { "block/link": { id: 42 } }))).toBe("embed");
  });
});
