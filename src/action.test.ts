import { describe, expect, it } from "vitest";
import { ActionSchema, parseAction } from "./action";

const minimalAction = {
  id: "spellcheck",
  title: "Spellcheck",
  description: "Fix spelling",
  scope: "block" as const,
  outputMode: "replace" as const,
  systemPrompt: "Fix spelling errors in the text.",
};

describe("ActionSchema", () => {
  it("parses a minimal valid action", () => {
    const result = ActionSchema.parse(minimalAction);
    expect(result.id).toBe("spellcheck");
    expect(result.scope).toBe("block");
    expect(result.outputMode).toBe("replace");
  });

  it("defaults description to empty string when omitted", () => {
    const { description: _desc, ...without } = minimalAction;
    const result = ActionSchema.parse(without);
    expect(result.description).toBe("");
  });

  it("rejects an empty id", () => {
    expect(() => ActionSchema.parse({ ...minimalAction, id: "" })).toThrow();
  });

  it("rejects an empty title", () => {
    expect(() => ActionSchema.parse({ ...minimalAction, title: "" })).toThrow();
  });

  it("rejects an empty systemPrompt", () => {
    expect(() => ActionSchema.parse({ ...minimalAction, systemPrompt: "" })).toThrow();
  });

  it("rejects an unknown scope", () => {
    expect(() => ActionSchema.parse({ ...minimalAction, scope: "page" })).toThrow();
  });

  it("rejects an unknown outputMode", () => {
    expect(() => ActionSchema.parse({ ...minimalAction, outputMode: "inline" })).toThrow();
  });

  it.each(["selection", "block", "subtree"] as const)("accepts scope=%s", (scope) => {
    expect(() => ActionSchema.parse({ ...minimalAction, scope })).not.toThrow();
  });

  it.each([
    "replace",
    "diff-panel",
    "append-children",
  ] as const)("accepts outputMode=%s", (mode) => {
    expect(() => ActionSchema.parse({ ...minimalAction, outputMode: mode })).not.toThrow();
  });
});

describe("parseAction", () => {
  it("returns a typed Action for valid input", () => {
    const action = parseAction(minimalAction);
    // Type-level assertion via usage
    expect(action.id).toBe("spellcheck");
  });

  it("throws a Zod error with the failing field when invalid", () => {
    expect(() => parseAction({ ...minimalAction, scope: "nope" })).toThrow(/scope/);
  });
});
