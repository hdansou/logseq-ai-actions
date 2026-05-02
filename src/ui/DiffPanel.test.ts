import { describe, expect, it } from "vitest";
import { type DiffPanelActionDesc, partitionBarItems, rewriteMenuLabel } from "./DiffPanel";

const a = (id: string, title: string): DiffPanelActionDesc => ({ id, title });

describe("partitionBarItems", () => {
  it("returns singles when no rewrite-* actions are present", () => {
    const items = partitionBarItems([a("spellcheck", "Spellcheck"), a("grammar", "Grammar")]);
    expect(items).toEqual([
      { kind: "single", id: "spellcheck", title: "Spellcheck" },
      { kind: "single", id: "grammar", title: "Grammar" },
    ]);
  });

  it("does not collapse a lone rewrite action — a one-item dropdown is dead UI", () => {
    const items = partitionBarItems([a("spellcheck", "Spellcheck"), a("rewrite", "Rewrite")]);
    expect(items.every((i) => i.kind === "single")).toBe(true);
  });

  it("collapses two or more rewrite-* actions into a single Rewrite group", () => {
    const items = partitionBarItems([
      a("spellcheck", "Spellcheck"),
      a("grammar", "Grammar"),
      a("rewrite", "Rewrite"),
      a("rewrite-formal", "Rewrite Formal"),
      a("rewrite-professional", "Rewrite Professional"),
      a("rewrite-casual", "Rewrite Casual"),
      a("rewrite-friendly", "Rewrite Friendly"),
      a("summarize", "Summarize"),
    ]);
    expect(items).toHaveLength(4);
    expect(items[0]).toEqual({ kind: "single", id: "spellcheck", title: "Spellcheck" });
    expect(items[1]).toEqual({ kind: "single", id: "grammar", title: "Grammar" });
    expect(items[2]).toMatchObject({ kind: "group", groupId: "rewrite", label: "Rewrite" });
    expect(items[3]).toEqual({ kind: "single", id: "summarize", title: "Summarize" });
    const group = items[2];
    if (!group || group.kind !== "group") throw new Error("expected group");
    expect(group.items.map((m) => m.id)).toEqual([
      "rewrite",
      "rewrite-formal",
      "rewrite-professional",
      "rewrite-casual",
      "rewrite-friendly",
    ]);
  });

  it("inserts the group at the position of the first rewrite-* action", () => {
    const items = partitionBarItems([
      a("rewrite-formal", "Rewrite Formal"),
      a("spellcheck", "Spellcheck"),
      a("rewrite", "Rewrite"),
    ]);
    expect(items[0]).toMatchObject({ kind: "group", groupId: "rewrite" });
    expect(items[1]).toEqual({ kind: "single", id: "spellcheck", title: "Spellcheck" });
    expect(items).toHaveLength(2);
  });

  it("includes user-defined rewrite-* actions in the group", () => {
    const items = partitionBarItems([
      a("rewrite", "Rewrite"),
      a("rewrite-snarky", "Rewrite Snarky"),
    ]);
    expect(items).toHaveLength(1);
    const group = items[0];
    if (!group || group.kind !== "group") throw new Error("expected group");
    expect(group.items.map((m) => m.id)).toEqual(["rewrite", "rewrite-snarky"]);
  });
});

describe("rewriteMenuLabel", () => {
  it.each([
    ["Rewrite", "Default"],
    ["Rewrite Formal", "Formal"],
    ["Rewrite Professional", "Professional"],
    ["Rewrite Casual", "Casual"],
    ["Rewrite Friendly", "Friendly"],
    ["Rewrite Snarky", "Snarky"],
  ])("%s → %s", (input, expected) => {
    expect(rewriteMenuLabel(input)).toBe(expected);
  });

  it("leaves unrelated titles untouched", () => {
    expect(rewriteMenuLabel("Bro mode")).toBe("Bro mode");
  });
});
