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

describe("parseOutline — markdown tables", () => {
  it("extracts a single well-formed table as a standalone top-level node", () => {
    const raw = ["| Col1 | Col2 |", "|------|------|", "| a    | b    |"].join("\n");
    expect(parseOutline(raw)).toEqual([
      {
        text: "| Col1 | Col2 |\n|------|------|\n| a    | b    |",
        children: [],
      },
    ]);
  });

  it("interleaves outline + table preserving source order, table at depth 0", () => {
    const raw = [
      "- Section A",
      "  - Sub",
      "| Col1 | Col2 |",
      "|------|------|",
      "| a    | b    |",
      "- Section B",
    ].join("\n");
    expect(parseOutline(raw)).toEqual([
      { text: "Section A", children: [{ text: "Sub", children: [] }] },
      { text: "| Col1 | Col2 |\n|------|------|\n| a    | b    |", children: [] },
      { text: "Section B", children: [] },
    ]);
  });

  it("emits multiple tables as separate top-level nodes", () => {
    const raw = [
      "| A | B |",
      "|---|---|",
      "| 1 | 2 |",
      "- Between",
      "| C | D |",
      "|---|---|",
      "| 3 | 4 |",
    ].join("\n");
    const tree = parseOutline(raw);
    expect(tree).toHaveLength(3);
    expect(tree[0]?.text).toContain("| A | B |");
    expect(tree[1]?.text).toBe("Between");
    expect(tree[2]?.text).toContain("| C | D |");
  });

  it("recognises tables with alignment markers (:--, --:, :-:)", () => {
    const raw = ["| A | B | C |", "|:--|--:|:-:|", "| 1 | 2 | 3 |"].join("\n");
    expect(parseOutline(raw)[0]?.text).toBe("| A | B | C |\n|:--|--:|:-:|\n| 1 | 2 | 3 |");
  });

  it("recognises tables with whitespace inside the separator row", () => {
    const raw = ["| A | B |", "| --- | --- |", "| 1 | 2 |"].join("\n");
    const tree = parseOutline(raw);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.children).toEqual([]);
  });

  it("falls back to bullet/text handling when the separator row is missing", () => {
    // Line 2 is not a separator (no ---) — so this is NOT a well-formed table.
    // Both lines are then treated as regular bullets / lenient text.
    const raw = ["| A | B |", "| 1 | 2 |"].join("\n");
    const tree = parseOutline(raw);
    // Expect 2 top-level nodes (each pipe-line becomes a bullet text node),
    // not a single table node.
    expect(tree).toHaveLength(2);
    expect(tree[0]?.text).toBe("| A | B |");
    expect(tree[1]?.text).toBe("| 1 | 2 |");
  });

  it("doesn't slurp a stray pipe line as a table", () => {
    const raw = ["- Foo", "| stray", "- Bar"].join("\n");
    const tree = parseOutline(raw);
    // 3 top-level bullets — the "| stray" line doesn't end with | so it
    // can't be a table line; gets treated as lenient bullet text.
    expect(tree).toHaveLength(3);
    expect(tree[1]?.text).toBe("| stray");
  });

  it("table at the very end of input doesn't loop or drop content", () => {
    const raw = ["- Intro", "| A | B |", "|---|---|", "| 1 | 2 |"].join("\n");
    const tree = parseOutline(raw);
    expect(tree).toHaveLength(2);
    expect(tree[0]?.text).toBe("Intro");
    expect(tree[1]?.text).toBe("| A | B |\n|---|---|\n| 1 | 2 |");
  });

  it("after a table, subsequent indented bullets restart at depth 0", () => {
    const raw = [
      "- Section A",
      "  - Sub",
      "| A | B |",
      "|---|---|",
      "| 1 | 2 |",
      "- Section B",
      "  - Sub B",
    ].join("\n");
    const tree = parseOutline(raw);
    expect(tree).toHaveLength(3);
    expect(tree[0]?.text).toBe("Section A");
    expect(tree[2]?.text).toBe("Section B");
    expect(tree[2]?.children).toEqual([{ text: "Sub B", children: [] }]);
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
