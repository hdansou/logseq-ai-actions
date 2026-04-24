import { describe, expect, it } from "vitest";
import { parsePoints } from "./parse-points";

describe("parsePoints", () => {
  it("splits on newlines and filters empty lines", () => {
    expect(parsePoints("first\nsecond\nthird")).toEqual(["first", "second", "third"]);
  });

  it("strips leading dash/asterisk/bullet prefixes", () => {
    expect(parsePoints("- first\n* second\n• third")).toEqual(["first", "second", "third"]);
  });

  it("strips numbered-list prefixes like '1.' / '1)' / '2.'", () => {
    expect(parsePoints("1. first\n2) second\n3. third")).toEqual(["first", "second", "third"]);
  });

  it("drops blank lines and whitespace-only lines", () => {
    expect(parsePoints("first\n\n   \nsecond")).toEqual(["first", "second"]);
  });

  it("trims leading and trailing whitespace from each line", () => {
    expect(parsePoints("  - first  \n  second\n")).toEqual(["first", "second"]);
  });

  it("handles models that wrap the list in a code fence", () => {
    const input = "```\n- first\n- second\n```";
    expect(parsePoints(input)).toEqual(["first", "second"]);
  });

  it("strips a 'Here are …' / 'Key points:' preamble line", () => {
    expect(parsePoints("Here are the key points:\n- one\n- two")).toEqual(["one", "two"]);
    expect(parsePoints("Key Points:\n- one\n- two")).toEqual(["one", "two"]);
  });

  it("returns empty array for empty input", () => {
    expect(parsePoints("")).toEqual([]);
    expect(parsePoints("\n\n  \n")).toEqual([]);
  });

  it("preserves embedded punctuation and wiki-syntax", () => {
    expect(parsePoints("- See [[Project]], owner #alice.\n- Due Friday.")).toEqual([
      "See [[Project]], owner #alice.",
      "Due Friday.",
    ]);
  });
});
