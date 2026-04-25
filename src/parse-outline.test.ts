import { describe, expect, it } from "vitest";
import { countOutlineNodes, parseOutline, renderOutlinePreview } from "./parse-outline";

describe("parseOutline", () => {
  it("parses a flat list of top-level bullets", () => {
    const tree = parseOutline("- Foo\n- Bar\n- Baz");
    expect(tree).toEqual([
      { text: "Foo", children: [] },
      { text: "Bar", children: [] },
      { text: "Baz", children: [] },
    ]);
  });

  it("parses two-space indentation as nesting depth", () => {
    const raw = ["- Parent", "  - Child A", "  - Child B", "- Sibling"].join("\n");
    expect(parseOutline(raw)).toEqual([
      {
        text: "Parent",
        children: [
          { text: "Child A", children: [] },
          { text: "Child B", children: [] },
        ],
      },
      { text: "Sibling", children: [] },
    ]);
  });

  it("handles multi-level nesting", () => {
    const raw = ["- Top", "  - Mid", "    - Leaf 1", "    - Leaf 2", "  - Mid sibling"].join("\n");
    expect(parseOutline(raw)).toEqual([
      {
        text: "Top",
        children: [
          {
            text: "Mid",
            children: [
              { text: "Leaf 1", children: [] },
              { text: "Leaf 2", children: [] },
            ],
          },
          { text: "Mid sibling", children: [] },
        ],
      },
    ]);
  });

  it("tolerates tabs as indentation (each tab = one level)", () => {
    const raw = ["- A", "\t- B", "\t\t- C"].join("\n");
    expect(parseOutline(raw)).toEqual([
      {
        text: "A",
        children: [{ text: "B", children: [{ text: "C", children: [] }] }],
      },
    ]);
  });

  it("accepts mixed bullet characters (- * •) and numeric", () => {
    const raw = ["- A", "  * B", "    • C", "  1. D"].join("\n");
    expect(parseOutline(raw)).toEqual([
      {
        text: "A",
        children: [
          { text: "B", children: [{ text: "C", children: [] }] },
          { text: "D", children: [] },
        ],
      },
    ]);
  });

  it("strips code fences that wrap the outline", () => {
    const raw = ["```markdown", "- A", "  - B", "```"].join("\n");
    expect(parseOutline(raw)).toEqual([{ text: "A", children: [{ text: "B", children: [] }] }]);
  });

  it("strips common preambles", () => {
    const raw = ["Here is the outline:", "- A", "- B"].join("\n");
    expect(parseOutline(raw)).toEqual([
      { text: "A", children: [] },
      { text: "B", children: [] },
    ]);
  });

  it("ignores blank lines", () => {
    const raw = ["- A", "", "  - B", "", "- C"].join("\n");
    expect(parseOutline(raw)).toEqual([
      { text: "A", children: [{ text: "B", children: [] }] },
      { text: "C", children: [] },
    ]);
  });

  it("treats an un-bulleted plain line as a bullet (lenient)", () => {
    const raw = ["A", "  B"].join("\n");
    expect(parseOutline(raw)).toEqual([{ text: "A", children: [{ text: "B", children: [] }] }]);
  });

  it("promotes an over-indented first line to root level", () => {
    // If the LLM forgets to start at column 0, don't lose everything.
    const raw = ["    - A", "      - B"].join("\n");
    expect(parseOutline(raw)).toEqual([{ text: "A", children: [{ text: "B", children: [] }] }]);
  });

  it("handles indent jumps gracefully (skip-level nesting)", () => {
    // LLM sometimes jumps from depth 0 straight to depth 2 — we treat
    // the deeper line as a child of the most recent node.
    const raw = ["- A", "    - B"].join("\n");
    const tree = parseOutline(raw);
    expect(tree).toEqual([{ text: "A", children: [{ text: "B", children: [] }] }]);
  });

  it("returns [] for empty input", () => {
    expect(parseOutline("")).toEqual([]);
    expect(parseOutline("   \n  \n")).toEqual([]);
  });

  it("counts every leaf", () => {
    const raw = ["- A", "  - B", "  - C", "- D", "  - E", "    - F"].join("\n");
    const tree = parseOutline(raw);
    // Sum of nodes at every depth, via a simple walker.
    const count = (nodes: ReturnType<typeof parseOutline>): number =>
      nodes.reduce((n, node) => n + 1 + count(node.children), 0);
    expect(count(tree)).toBe(6);
  });
});

describe("countOutlineNodes", () => {
  it("returns 0 for an empty tree", () => {
    expect(countOutlineNodes([])).toBe(0);
  });

  it("counts a flat tree", () => {
    expect(countOutlineNodes(parseOutline("- A\n- B\n- C"))).toBe(3);
  });

  it("counts a nested tree recursively", () => {
    const tree = parseOutline(["- A", "  - B", "    - C", "- D"].join("\n"));
    expect(countOutlineNodes(tree)).toBe(4);
  });
});

describe("renderOutlinePreview", () => {
  it("renders a flat tree as • lines", () => {
    const tree = parseOutline("- A\n- B");
    expect(renderOutlinePreview(tree)).toBe("• A\n• B");
  });

  it("indents children under their parent", () => {
    const tree = parseOutline(["- A", "  - B", "    - C", "- D"].join("\n"));
    expect(renderOutlinePreview(tree)).toBe(["• A", "  • B", "    • C", "• D"].join("\n"));
  });

  it("returns empty string for empty tree", () => {
    expect(renderOutlinePreview([])).toBe("");
  });
});
