import { describe, expect, it } from "vitest";
import { ActionSchema } from "./action";
import { findSeedAction, SEED_ACTIONS } from "./seed-actions";

describe("SEED_ACTIONS", () => {
  it("contains spellcheck, grammar, rewrite, summarize in that order", () => {
    expect(SEED_ACTIONS.map((a) => a.id)).toEqual([
      "spellcheck",
      "grammar",
      "rewrite",
      "summarize",
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

  it("every seed action currently uses block scope (MVP)", () => {
    // When subtree-scoped summarize lands, update this test.
    for (const a of SEED_ACTIONS) {
      expect(a.scope).toBe("block");
    }
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
