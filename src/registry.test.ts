import { describe, expect, it } from "vitest";
import type { Action } from "./action";
import { buildRegistry } from "./registry";

const BUILTIN: readonly Action[] = [
  {
    id: "spellcheck",
    title: "Spellcheck",
    description: "built-in",
    scope: "block",
    outputMode: "replace",
    kind: "text",
    systemPrompt: "built-in spellcheck",
  },
  {
    id: "rewrite",
    title: "Rewrite",
    description: "built-in",
    scope: "block",
    outputMode: "diff-panel",
    kind: "text",
    systemPrompt: "built-in rewrite",
  },
];

describe("buildRegistry", () => {
  it("returns built-in actions unchanged when userJson is empty / undefined / null / whitespace", () => {
    for (const input of ["", "   ", undefined, null]) {
      const result = buildRegistry(BUILTIN, input);
      expect(result.actions).toEqual(BUILTIN);
      expect(result.errors).toEqual([]);
    }
  });

  it("accepts a valid user JSON array and appends new actions after the built-ins", () => {
    const userJson = JSON.stringify([
      {
        id: "simplify",
        title: "Simplify",
        scope: "block",
        outputMode: "replace",
        systemPrompt: "Rewrite simpler.",
      },
    ]);
    const result = buildRegistry(BUILTIN, userJson);
    expect(result.errors).toEqual([]);
    expect(result.actions).toHaveLength(3);
    expect(result.actions[0]?.id).toBe("spellcheck");
    expect(result.actions[1]?.id).toBe("rewrite");
    expect(result.actions[2]?.id).toBe("simplify");
  });

  it("shadows a built-in action in place when user provides the same id", () => {
    const userJson = JSON.stringify([
      {
        id: "spellcheck",
        title: "My Spellcheck",
        scope: "block",
        outputMode: "replace",
        systemPrompt: "custom prompt",
      },
    ]);
    const result = buildRegistry(BUILTIN, userJson);
    expect(result.actions).toHaveLength(2);
    // Same slot (index 0), new definition
    expect(result.actions[0]?.id).toBe("spellcheck");
    expect(result.actions[0]?.title).toBe("My Spellcheck");
    expect(result.actions[0]?.systemPrompt).toBe("custom prompt");
    // rewrite still present, untouched
    expect(result.actions[1]?.systemPrompt).toBe("built-in rewrite");
  });

  it("reports a parse error and returns built-ins only when JSON is malformed", () => {
    const result = buildRegistry(BUILTIN, "{ not valid json");
    expect(result.actions).toEqual(BUILTIN);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]?.toLowerCase()).toContain("parse");
  });

  it("reports a shape error when the top level is not an array", () => {
    const result = buildRegistry(BUILTIN, JSON.stringify({ notAnArray: true }));
    expect(result.actions).toEqual(BUILTIN);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]?.toLowerCase()).toMatch(/array/);
  });

  it("validates each entry independently — bad entries are skipped, good ones load", () => {
    const userJson = JSON.stringify([
      {
        id: "valid",
        title: "Valid",
        scope: "block",
        outputMode: "replace",
        systemPrompt: "works",
      },
      { id: "missing-title", scope: "block", outputMode: "replace", systemPrompt: "oops" },
      {
        id: "bad-scope",
        title: "Bad",
        scope: "page",
        outputMode: "replace",
        systemPrompt: "oops",
      },
    ]);
    const result = buildRegistry(BUILTIN, userJson);
    expect(result.actions.find((a) => a.id === "valid")).toBeTruthy();
    expect(result.actions.find((a) => a.id === "missing-title")).toBeUndefined();
    expect(result.actions.find((a) => a.id === "bad-scope")).toBeUndefined();
    expect(result.errors).toHaveLength(2);
  });

  it("dedupes duplicate user ids by keeping the first and reporting the rest", () => {
    const userJson = JSON.stringify([
      {
        id: "dup",
        title: "First",
        scope: "block",
        outputMode: "replace",
        systemPrompt: "first",
      },
      {
        id: "dup",
        title: "Second",
        scope: "block",
        outputMode: "replace",
        systemPrompt: "second",
      },
    ]);
    const result = buildRegistry(BUILTIN, userJson);
    const dup = result.actions.find((a) => a.id === "dup");
    expect(dup?.title).toBe("First");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.toLowerCase()).toMatch(/duplicate/);
  });

  it("error messages include the entry index so users can find what failed", () => {
    const userJson = JSON.stringify([
      {
        id: "ok",
        title: "OK",
        scope: "block",
        outputMode: "replace",
        systemPrompt: "fine",
      },
      { id: "bad" },
    ]);
    const result = buildRegistry(BUILTIN, userJson);
    expect(result.errors[0]).toMatch(/index 1/);
  });

  it("does not mutate the built-in array", () => {
    const frozenBuiltin = Object.freeze([...BUILTIN]);
    buildRegistry(frozenBuiltin, JSON.stringify([]));
    // would throw TypeError if buildRegistry tried to mutate it
    expect(frozenBuiltin).toEqual(BUILTIN);
  });
});
