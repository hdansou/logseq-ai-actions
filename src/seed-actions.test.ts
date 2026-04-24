import { describe, expect, it } from "vitest";
import { ActionSchema } from "./action";
import { findSeedAction, SEED_ACTIONS } from "./seed-actions";

describe("SEED_ACTIONS", () => {
  it("contains spellcheck, grammar, rewrite, summarize, key-points in that order", () => {
    expect(SEED_ACTIONS.map((a) => a.id)).toEqual([
      "spellcheck",
      "grammar",
      "rewrite",
      "summarize",
      "key-points",
    ]);
  });

  it("every seed action passes ActionSchema validation", () => {
    for (const action of SEED_ACTIONS) {
      expect(() => ActionSchema.parse(action)).not.toThrow();
    }
  });

  it("every seed action has a systemPrompt instructing the model to 'return only'", () => {
    for (const a of SEED_ACTIONS) {
      expect(a.systemPrompt.length).toBeGreaterThan(10);
      expect(a.systemPrompt.toLowerCase()).toMatch(/return only/);
    }
  });

  it("no duplicate ids", () => {
    const ids = SEED_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("scope assignments match the seed set", () => {
    const byId = Object.fromEntries(SEED_ACTIONS.map((a) => [a.id, a.scope]));
    expect(byId).toEqual({
      spellcheck: "block",
      grammar: "block",
      rewrite: "block",
      summarize: "subtree",
      "key-points": "subtree",
    });
  });

  it("outputMode assignments match the seed set", () => {
    const byId = Object.fromEntries(SEED_ACTIONS.map((a) => [a.id, a.outputMode]));
    expect(byId).toEqual({
      spellcheck: "replace",
      grammar: "replace",
      rewrite: "diff-panel",
      summarize: "diff-panel",
      "key-points": "append-children",
    });
  });
});

describe("findSeedAction", () => {
  it("returns the action for a known id", () => {
    expect(findSeedAction("grammar")?.title).toBe("Grammar");
  });

  it("returns undefined for unknown id", () => {
    expect(findSeedAction("nonexistent")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(findSeedAction("")).toBeUndefined();
  });
});
