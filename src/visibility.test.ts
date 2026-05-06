import { describe, expect, it } from "vitest";
import type { Action } from "./action";
import { filterHiddenActions, parseHiddenActionIds, partitionVisibleAndHidden } from "./visibility";

const action = (id: string, title = id): Action => ({
  id,
  title,
  description: "",
  scope: "block",
  outputMode: "replace",
  kind: "text",
  systemPrompt: `prompt for ${id}`,
});

const ACTIONS: readonly Action[] = [
  action("spellcheck"),
  action("rewrite"),
  action("rewrite-formal"),
  action("summarize"),
];

describe("filterHiddenActions", () => {
  it("returns input content unchanged when hiddenIds is empty", () => {
    expect(filterHiddenActions(ACTIONS, [])).toEqual(ACTIONS);
  });

  it("drops the single action whose id matches", () => {
    const result = filterHiddenActions(ACTIONS, ["rewrite"]);
    expect(result.map((a) => a.id)).toEqual(["spellcheck", "rewrite-formal", "summarize"]);
  });

  it("drops every action whose id matches when multiple ids are hidden", () => {
    const result = filterHiddenActions(ACTIONS, ["spellcheck", "summarize"]);
    expect(result.map((a) => a.id)).toEqual(["rewrite", "rewrite-formal"]);
  });

  it("ignores hidden ids that don't appear in actions", () => {
    const result = filterHiddenActions(ACTIONS, ["nonexistent", "also-not-here"]);
    expect(result).toEqual(ACTIONS);
  });

  it("preserves declared order across surviving items", () => {
    const result = filterHiddenActions(ACTIONS, ["rewrite-formal"]);
    expect(result.map((a) => a.id)).toEqual(["spellcheck", "rewrite", "summarize"]);
  });

  it("handles a built-in / user mix and hides whichever id matches", () => {
    const mixed = [...ACTIONS, action("translate-fr"), action("old-template")];
    const result = filterHiddenActions(mixed, ["translate-fr", "rewrite"]);
    expect(result.map((a) => a.id)).toEqual([
      "spellcheck",
      "rewrite-formal",
      "summarize",
      "old-template",
    ]);
  });

  it("returns an empty list when every action is hidden", () => {
    const result = filterHiddenActions(
      ACTIONS,
      ACTIONS.map((a) => a.id),
    );
    expect(result).toEqual([]);
  });
});

describe("parseHiddenActionIds", () => {
  it("returns [] for undefined", () => {
    expect(parseHiddenActionIds(undefined)).toEqual([]);
  });

  it("returns [] for null", () => {
    expect(parseHiddenActionIds(null)).toEqual([]);
  });

  it("returns [] for an empty array", () => {
    expect(parseHiddenActionIds([])).toEqual([]);
  });

  it("returns [] for non-array input (numbers, strings, objects)", () => {
    expect(parseHiddenActionIds("spellcheck")).toEqual([]);
    expect(parseHiddenActionIds(42)).toEqual([]);
    expect(parseHiddenActionIds({ id: "spellcheck" })).toEqual([]);
  });

  it("returns the array unchanged when every entry is a string", () => {
    expect(parseHiddenActionIds(["spellcheck", "rewrite"])).toEqual(["spellcheck", "rewrite"]);
  });

  it("filters out non-string entries without throwing", () => {
    const raw = ["spellcheck", 42, null, "rewrite", undefined, { id: "x" }];
    expect(parseHiddenActionIds(raw)).toEqual(["spellcheck", "rewrite"]);
  });

  it("returns a fresh array (not a reference to the input)", () => {
    const raw = ["spellcheck"];
    const result = parseHiddenActionIds(raw);
    expect(result).toEqual(["spellcheck"]);
    expect(result).not.toBe(raw);
  });
});

describe("partitionVisibleAndHidden", () => {
  it("returns all actions in 'visible' and an empty 'hidden' when nothing is hidden", () => {
    const { visible, hidden } = partitionVisibleAndHidden(ACTIONS, []);
    expect(visible).toEqual(ACTIONS);
    expect(hidden).toEqual([]);
  });

  it("returns an empty 'visible' and all actions in 'hidden' when every id is hidden", () => {
    const ids = ACTIONS.map((a) => a.id);
    const { visible, hidden } = partitionVisibleAndHidden(ACTIONS, ids);
    expect(visible).toEqual([]);
    expect(hidden).toEqual(ACTIONS);
  });

  it("partitions a mix while preserving declared order in each bucket", () => {
    const { visible, hidden } = partitionVisibleAndHidden(ACTIONS, ["rewrite", "summarize"]);
    expect(visible.map((a) => a.id)).toEqual(["spellcheck", "rewrite-formal"]);
    expect(hidden.map((a) => a.id)).toEqual(["rewrite", "summarize"]);
  });

  it("handles an empty actions list", () => {
    const { visible, hidden } = partitionVisibleAndHidden([], ["spellcheck"]);
    expect(visible).toEqual([]);
    expect(hidden).toEqual([]);
  });

  it("ignores hidden ids that don't match any action", () => {
    const { visible, hidden } = partitionVisibleAndHidden(ACTIONS, ["does-not-exist"]);
    expect(visible).toEqual(ACTIONS);
    expect(hidden).toEqual([]);
  });
});
