import { describe, expect, it } from "vitest";
import { flattenSubtree } from "./subtree";

describe("flattenSubtree", () => {
  it("formats a single block with no children as one bulleted line", () => {
    expect(flattenSubtree({ title: "Hello world" })).toBe("- Hello world");
  });

  it("prefers title over the deprecated content field (runtime-gotchas §13)", () => {
    expect(flattenSubtree({ title: "new", content: "old" })).toBe("- new");
  });

  it("falls back to content when title is missing", () => {
    expect(flattenSubtree({ content: "fallback" })).toBe("- fallback");
  });

  it("falls back to empty string when both title and content are missing", () => {
    expect(flattenSubtree({})).toBe("- ");
  });

  it("flattens a flat child list at one level of 2-space indent", () => {
    const result = flattenSubtree({
      title: "root",
      children: [{ title: "a" }, { title: "b" }],
    });
    expect(result).toBe("- root\n  - a\n  - b");
  });

  it("nests recursively at increasing indent depth", () => {
    const result = flattenSubtree({
      title: "root",
      children: [{ title: "l1", children: [{ title: "l2", children: [{ title: "l3" }] }] }],
    });
    expect(result).toBe("- root\n  - l1\n    - l2\n      - l3");
  });

  it("treats an empty children array the same as no children", () => {
    expect(flattenSubtree({ title: "root", children: [] })).toBe("- root");
  });

  it("trims surrounding whitespace from each block's text", () => {
    expect(flattenSubtree({ title: "  hi  " })).toBe("- hi");
  });

  it("accepts a custom indentSpaces option", () => {
    const result = flattenSubtree(
      { title: "root", children: [{ title: "c" }] },
      { indentSpaces: 4 },
    );
    expect(result).toBe("- root\n    - c");
  });

  it("produces output the LLM can parse as a Markdown outline", () => {
    // Round-trip check — sanity that the shape matches common Markdown
    // outline conventions (leading "- ", 2-space indent per depth, lines
    // separated by "\n"). Not a formal parse, just a sanity assertion.
    const result = flattenSubtree({
      title: "Project",
      children: [
        { title: "Goals", children: [{ title: "Ship v1" }, { title: "Keep tests green" }] },
        { title: "Risks" },
      ],
    });
    expect(result.split("\n")).toEqual([
      "- Project",
      "  - Goals",
      "    - Ship v1",
      "    - Keep tests green",
      "  - Risks",
    ]);
  });
});
