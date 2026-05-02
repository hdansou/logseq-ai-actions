import { describe, expect, it } from "vitest";
import type { Action } from "../action";
import { categorizeAction, groupActionsForPicker, type TaggedAction } from "./picker-categories";

const a = (id: string, kind: "text" | "vision" = "text") => ({ id, kind });

/** Build a tagged Action stub with sensible defaults; tests override what they care about. */
const tagged = (overrides: Partial<Action> & { id: string; isBuiltin: boolean }): TaggedAction => ({
  id: overrides.id,
  title: overrides.title ?? overrides.id,
  description: overrides.description ?? "",
  scope: overrides.scope ?? "block",
  outputMode: overrides.outputMode ?? "diff-panel",
  systemPrompt: overrides.systemPrompt ?? "x",
  kind: overrides.kind ?? "text",
  isBuiltin: overrides.isBuiltin,
});

describe("categorizeAction", () => {
  describe("fix", () => {
    it.each(["spellcheck", "grammar", "spellcheck-spanish", "grammar-german"])("%s → fix", (id) => {
      expect(categorizeAction(a(id))).toBe("fix");
    });
  });

  describe("rewrite", () => {
    it.each([
      "rewrite",
      "rewrite-formal",
      "rewrite-professional",
      "rewrite-casual",
      "rewrite-friendly",
      "rewrite-snarky",
    ])("%s → rewrite", (id) => {
      expect(categorizeAction(a(id))).toBe("rewrite");
    });
  });

  describe("transform", () => {
    it.each([
      "summarize",
      "key-points",
      "outline-replace",
      "outline-append",
      "summarize-tldr",
      "key-points-numbered",
      "outline-bullet",
    ])("%s → transform", (id) => {
      expect(categorizeAction(a(id))).toBe("transform");
    });
  });

  describe("vision", () => {
    it("classifies kind:vision actions as vision regardless of id", () => {
      expect(categorizeAction(a("image-title", "vision"))).toBe("vision");
      expect(categorizeAction(a("extract-image-text", "vision"))).toBe("vision");
      // Vision short-circuits id-pattern checks per the requirement spec.
      expect(categorizeAction(a("rewrite", "vision"))).toBe("vision");
      expect(categorizeAction(a("spellcheck", "vision"))).toBe("vision");
    });
  });

  describe("custom", () => {
    it.each([
      "translate",
      "explain",
      "make-toc",
      "my-custom-thing",
    ])("%s (no prefix match) → custom", (id) => {
      expect(categorizeAction(a(id))).toBe("custom");
    });

    it("does not treat partial-word matches as prefix matches", () => {
      // "rewriter" is not "rewrite" + "-something" — it should NOT match Rewrite.
      expect(categorizeAction(a("rewriter"))).toBe("custom");
      expect(categorizeAction(a("summarizer"))).toBe("custom");
      expect(categorizeAction(a("outliner"))).toBe("custom");
      expect(categorizeAction(a("grammary"))).toBe("custom");
    });
  });
});

describe("groupActionsForPicker", () => {
  it("returns empty array when given no actions", () => {
    expect(groupActionsForPicker([])).toEqual([]);
  });

  it("emits sections in fixed order: Fix, Rewrite, Transform, Vision, Custom", () => {
    const groups = groupActionsForPicker([
      tagged({ id: "translate", isBuiltin: false }),
      tagged({ id: "image-title", kind: "vision", isBuiltin: true }),
      tagged({ id: "summarize", isBuiltin: true }),
      tagged({ id: "rewrite", isBuiltin: true }),
      tagged({ id: "spellcheck", isBuiltin: true }),
    ]);
    expect(groups.map((g) => g.category)).toEqual([
      "fix",
      "rewrite",
      "transform",
      "vision",
      "custom",
    ]);
  });

  it("omits empty categories — only sections with at least one action are returned", () => {
    const groups = groupActionsForPicker([
      tagged({ id: "rewrite", isBuiltin: true }),
      tagged({ id: "rewrite-formal", isBuiltin: true }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.category).toBe("rewrite");
  });

  it("preserves the declared order of actions within a section", () => {
    const groups = groupActionsForPicker([
      tagged({ id: "rewrite-friendly", isBuiltin: true }),
      tagged({ id: "rewrite", isBuiltin: true }),
      tagged({ id: "rewrite-formal", isBuiltin: true }),
    ]);
    expect(groups[0]?.actions.map((x) => x.id)).toEqual([
      "rewrite-friendly",
      "rewrite",
      "rewrite-formal",
    ]);
  });

  it("attaches a stable, human-readable label to each section", () => {
    const groups = groupActionsForPicker([
      tagged({ id: "spellcheck", isBuiltin: true }),
      tagged({ id: "rewrite", isBuiltin: true }),
      tagged({ id: "summarize", isBuiltin: true }),
      tagged({ id: "image-title", kind: "vision", isBuiltin: true }),
      tagged({ id: "translate", isBuiltin: false }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Fix", "Rewrite", "Transform", "Vision", "Custom"]);
  });

  it("auto-routes user actions whose id matches a built-in prefix into the matching section", () => {
    const groups = groupActionsForPicker([
      tagged({ id: "rewrite", isBuiltin: true }),
      tagged({ id: "rewrite-snarky", isBuiltin: false }),
      tagged({ id: "translate", isBuiltin: false }),
    ]);
    const rewrite = groups.find((g) => g.category === "rewrite");
    const custom = groups.find((g) => g.category === "custom");
    expect(rewrite?.actions.map((x) => x.id)).toEqual(["rewrite", "rewrite-snarky"]);
    expect(custom?.actions.map((x) => x.id)).toEqual(["translate"]);
  });

  it("carries the isBuiltin flag through to consumers so the panel can render the custom pill", () => {
    const groups = groupActionsForPicker([
      tagged({ id: "rewrite", isBuiltin: true }),
      tagged({ id: "rewrite-snarky", isBuiltin: false }),
    ]);
    const rewrite = groups.find((g) => g.category === "rewrite");
    expect(rewrite?.actions.map((x) => ({ id: x.id, isBuiltin: x.isBuiltin }))).toEqual([
      { id: "rewrite", isBuiltin: true },
      { id: "rewrite-snarky", isBuiltin: false },
    ]);
  });
});
