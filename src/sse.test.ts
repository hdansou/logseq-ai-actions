import { describe, expect, it } from "vitest";
import { createSSEParser } from "./sse";

function chunk(delta: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`;
}

describe("createSSEParser", () => {
  it("emits content from a single complete delta", () => {
    const parser = createSSEParser();
    expect(parser.push(chunk("hello"))).toEqual(["hello"]);
  });

  it("emits multiple deltas from one push", () => {
    const parser = createSSEParser();
    expect(parser.push(`${chunk("one")}${chunk("two")}`)).toEqual(["one", "two"]);
  });

  it("buffers partial lines across pushes", () => {
    const parser = createSSEParser();
    const payload = chunk("complete phrase");
    const split = Math.floor(payload.length / 2);
    const first = parser.push(payload.slice(0, split));
    const second = parser.push(payload.slice(split));
    expect([...first, ...second]).toEqual(["complete phrase"]);
  });

  it("ignores the [DONE] terminator", () => {
    const parser = createSSEParser();
    expect(parser.push(`${chunk("hi")}data: [DONE]\n\n`)).toEqual(["hi"]);
  });

  it("ignores malformed data: lines without crashing", () => {
    const parser = createSSEParser();
    expect(parser.push("data: {not valid json}\n\ndata: :: also not json\n\n")).toEqual([]);
  });

  it("ignores non-data SSE fields (event:, id:, retry:, comments)", () => {
    const parser = createSSEParser();
    const input = `event: message\nid: 1\nretry: 1000\n: this is a comment\n${chunk("hello")}`;
    expect(parser.push(input)).toEqual(["hello"]);
  });

  it("drops deltas with empty content", () => {
    const parser = createSSEParser();
    const empty = `data: ${JSON.stringify({ choices: [{ delta: { content: "" } }] })}\n\n`;
    expect(parser.push(empty + chunk("actual"))).toEqual(["actual"]);
  });

  it("drops deltas with no content field (e.g. role-only first chunk)", () => {
    const parser = createSSEParser();
    const roleOnly = `data: ${JSON.stringify({ choices: [{ delta: { role: "assistant" } }] })}\n\n`;
    expect(parser.push(roleOnly + chunk("hi"))).toEqual(["hi"]);
  });

  it("flush() emits any trailing valid data line the buffer still holds", () => {
    const parser = createSSEParser();
    // Send without the trailing \n to simulate a stream that closed mid-line.
    const payload = chunk("trail").replace(/\n+$/, "");
    expect(parser.push(payload)).toEqual([]);
    expect(parser.flush()).toEqual(["trail"]);
  });

  it("flush() returns empty when buffer is empty or not a valid data line", () => {
    const parser = createSSEParser();
    expect(parser.flush()).toEqual([]);
    parser.push("partial garbage");
    expect(parser.flush()).toEqual([]);
  });

  it("handles realistic OpenAI streaming sequence", () => {
    const parser = createSSEParser();
    const sequence = [
      `data: ${JSON.stringify({ choices: [{ delta: { role: "assistant" } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hello" } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: ", " } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "world!" } }] })}\n\n`,
      "data: [DONE]\n\n",
    ].join("");
    // Simulate arrival in two splits to exercise the buffer.
    const mid = Math.floor(sequence.length / 2);
    const emitted = [...parser.push(sequence.slice(0, mid)), ...parser.push(sequence.slice(mid))];
    expect(emitted.join("")).toBe("Hello, world!");
  });
});
