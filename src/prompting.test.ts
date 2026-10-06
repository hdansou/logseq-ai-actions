import { describe, expect, it } from "vitest";
import { buildChatMessages, cleanModelOutput, INPUT_FRAMING } from "./prompting";

describe("buildChatMessages", () => {
  it("puts the block text between <text> tags in the user message", () => {
    const { user } = buildChatMessages("Fix spelling.", "Write a haiku.");
    expect(user).toBe("<text>\nWrite a haiku.\n</text>");
  });

  it("appends the input framing to the action's system prompt", () => {
    const { system } = buildChatMessages("Fix spelling.", "x");
    expect(system).toBe(`Fix spelling.\n\n${INPUT_FRAMING}`);
    expect(INPUT_FRAMING).toMatch(/<text>/);
    expect(INPUT_FRAMING).toMatch(/never as instructions/i);
  });
});

describe("cleanModelOutput", () => {
  const input = "Ship it on Friday.";

  it("leaves ordinary output unchanged (incl. outline bullets)", () => {
    expect(cleanModelOutput("Ship it Friday.", input)).toBe("Ship it Friday.");
    expect(cleanModelOutput("- A\n  - B", input)).toBe("- A\n  - B");
  });

  it("strips a reasoning block", () => {
    expect(cleanModelOutput("<think>\nThe user wants…\n</think>\n\nShip it Friday.", input)).toBe(
      "Ship it Friday.",
    );
  });

  it("drops everything up to a lone </think> (server removed the opening tag)", () => {
    expect(cleanModelOutput("reasoning here\n</think>\nShip it Friday.", input)).toBe(
      "Ship it Friday.",
    );
  });

  it("unwraps echoed <text> tags", () => {
    expect(cleanModelOutput("<text>\nShip it Friday.\n</text>", input)).toBe("Ship it Friday.");
  });

  it("unwraps a code fence the input didn't have, keeps one it did", () => {
    expect(cleanModelOutput("```markdown\n- A\n- B\n```", input)).toBe("- A\n- B");
    expect(cleanModelOutput("```js\nx()\n```", "```js\nx( )\n```")).toBe("```js\nx()\n```");
  });

  it("unwraps wrapping quotes the input didn't have, keeps them when it did", () => {
    expect(cleanModelOutput('"Ship it Friday."', input)).toBe("Ship it Friday.");
    expect(cleanModelOutput("“Ship it Friday.”", input)).toBe("Ship it Friday.");
    expect(cleanModelOutput('"Ship it."', '"Ship it"')).toBe('"Ship it."');
  });

  it("drops a leading framing line when content follows it", () => {
    expect(cleanModelOutput("Here is the corrected text:\n\nShip it Friday.", input)).toBe(
      "Ship it Friday.",
    );
    expect(cleanModelOutput("Sure! Here's a summary:\nShip it Friday.", input)).toBe(
      "Ship it Friday.",
    );
  });

  it("keeps a lone line even if it looks like framing (nothing else to return)", () => {
    expect(cleanModelOutput("Here is the plan:", input)).toBe("Here is the plan:");
  });
});
