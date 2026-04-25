import { describe, expect, it } from "vitest";
import { ActionSchema } from "./action";
import { findSeedAction, SEED_ACTIONS } from "./seed-actions";

describe("SEED_ACTIONS", () => {
  it("contains the seed set in the documented order (rewrite variants sit after rewrite, summarize/key-points last)", () => {
    expect(SEED_ACTIONS.map((a) => a.id)).toEqual([
      "spellcheck",
      "grammar",
      "rewrite",
      "rewrite-formal",
      "rewrite-professional",
      "rewrite-casual",
      "rewrite-friendly",
      "summarize",
      "key-points",
      "outline-replace",
      "outline-append",
      "image-title",
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
      "rewrite-formal": "block",
      "rewrite-professional": "block",
      "rewrite-casual": "block",
      "rewrite-friendly": "block",
      summarize: "subtree",
      "key-points": "subtree",
      "outline-replace": "subtree",
      "outline-append": "subtree",
      "image-title": "block",
    });
  });

  it("outputMode assignments match the seed set", () => {
    const byId = Object.fromEntries(SEED_ACTIONS.map((a) => [a.id, a.outputMode]));
    expect(byId).toEqual({
      spellcheck: "diff-panel",
      grammar: "diff-panel",
      rewrite: "diff-panel",
      "rewrite-formal": "diff-panel",
      "rewrite-professional": "diff-panel",
      "rewrite-casual": "diff-panel",
      "rewrite-friendly": "diff-panel",
      summarize: "diff-panel",
      "key-points": "append-children",
      "outline-replace": "outline-replace",
      "outline-append": "outline-append",
      "image-title": "picker-replace",
    });
  });

  it("image-title is the only seed action with kind='vision'; everything else defaults to 'text'", () => {
    const visionIds = SEED_ACTIONS.filter((a) => a.kind === "vision").map((a) => a.id);
    expect(visionIds).toEqual(["image-title"]);
    const textIds = SEED_ACTIONS.filter((a) => a.kind === "text").map((a) => a.id);
    expect(textIds).toContain("spellcheck");
    expect(textIds).toContain("rewrite");
  });

  it("image-title prompt asks for exactly 3 titles in 3-6 words, sentence case", () => {
    const action = SEED_ACTIONS.find((a) => a.id === "image-title");
    expect(action).toBeDefined();
    const p = action?.systemPrompt.toLowerCase() ?? "";
    expect(p).toMatch(/three|3/);
    expect(p).toMatch(/3 to 6 words|3-6 words/);
    expect(p).toMatch(/sentence case/);
  });

  it("spellcheck prompt is surgical — preserves proper nouns, code, URLs, wikilinks", () => {
    const spellcheck = SEED_ACTIONS.find((a) => a.id === "spellcheck");
    expect(spellcheck).toBeDefined();
    const prompt = spellcheck?.systemPrompt.toLowerCase() ?? "";
    // Regression guard: every simplification of this prompt must keep these
    // explicit carve-outs or small local models over-correct real text.
    expect(prompt).toMatch(/proper noun/);
    expect(prompt).toMatch(/code/);
    expect(prompt).toMatch(/url/);
    expect(prompt).toMatch(/\[\[|wikilink/);
  });

  it("grammar prompt is surgical — flags real categories, ignores style/notes conventions, preserves code/URLs/wikilinks", () => {
    const grammar = SEED_ACTIONS.find((a) => a.id === "grammar");
    expect(grammar).toBeDefined();
    const prompt = grammar?.systemPrompt.toLowerCase() ?? "";
    // Regression guard: keep the surgical carve-outs in place. Small local
    // models drift toward "rephrase the whole thing" without these.
    expect(prompt).toMatch(/subject-verb/);
    expect(prompt).toMatch(/passive voice/); // must be in the don't-flag list
    expect(prompt).toMatch(/code/);
    expect(prompt).toMatch(/url/);
    expect(prompt).toMatch(/\[\[|wikilink/);
  });

  it("each tone rewrite action names its target tone in the prompt", () => {
    const byId = Object.fromEntries(SEED_ACTIONS.map((a) => [a.id, a.systemPrompt.toLowerCase()]));
    expect(byId["rewrite-formal"]).toMatch(/formal/);
    expect(byId["rewrite-casual"]).toMatch(/casual/);
    expect(byId["rewrite-friendly"]).toMatch(/friendly/);
  });

  it("rewrite-professional prompt references the Amazon writing style", () => {
    const prof = SEED_ACTIONS.find((a) => a.id === "rewrite-professional");
    expect(prof).toBeDefined();
    expect(prof?.systemPrompt.toLowerCase()).toMatch(/amazon/);
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
