import { describe, expect, it } from "vitest";
import { parseTitles } from "./parse-titles";

describe("parseTitles", () => {
  it("parses a clean newline-separated list, returning the first n", () => {
    expect(
      parseTitles("Sunset over the harbor\nMorning coffee on a deck\nKitten on a keyboard", 3),
    ).toEqual(["Sunset over the harbor", "Morning coffee on a deck", "Kitten on a keyboard"]);
  });

  it("strips numbered prefixes (1., 1), 1:)", () => {
    expect(parseTitles("1. First title\n2) Second title\n3: Third title", 3)).toEqual([
      "First title",
      "Second title",
      "Third title",
    ]);
  });

  it("strips bullet prefixes (-, *, •)", () => {
    expect(parseTitles("- One\n* Two\n• Three", 3)).toEqual(["One", "Two", "Three"]);
  });

  it("strips wrapping double quotes per line", () => {
    expect(parseTitles('"Wrapped one"\n"Wrapped two"', 2)).toEqual(["Wrapped one", "Wrapped two"]);
  });

  it("strips wrapping single quotes per line", () => {
    expect(parseTitles("'Single quoted'", 1)).toEqual(["Single quoted"]);
  });

  it("strips a 'Here are 3 titles:' style preamble", () => {
    expect(parseTitles("Here are three titles:\n- A\n- B\n- C", 3)).toEqual(["A", "B", "C"]);
  });

  it("strips code fences wrapping the response", () => {
    expect(parseTitles("```\nA\nB\nC\n```", 3)).toEqual(["A", "B", "C"]);
  });

  it("ignores blank lines", () => {
    expect(parseTitles("\nA\n\nB\n\nC\n", 3)).toEqual(["A", "B", "C"]);
  });

  it("caps output at n even when more lines are present", () => {
    expect(parseTitles("A\nB\nC\nD\nE", 3)).toEqual(["A", "B", "C"]);
  });

  it("returns fewer than n if the model gave fewer", () => {
    expect(parseTitles("Only one", 3)).toEqual(["Only one"]);
  });

  it("returns [] for empty input", () => {
    expect(parseTitles("", 3)).toEqual([]);
    expect(parseTitles("   \n   ", 3)).toEqual([]);
  });

  it("collapses whitespace inside a candidate (multi-space → single)", () => {
    expect(parseTitles("Title  with    weird   spacing", 1)).toEqual(["Title with weird spacing"]);
  });

  it("trims trailing punctuation that would look ugly in a title", () => {
    expect(parseTitles("Sunset over the harbor.\nMorning coffee.", 2)).toEqual([
      "Sunset over the harbor",
      "Morning coffee",
    ]);
  });

  it("preserves question marks (legitimate title punctuation)", () => {
    expect(parseTitles("Is it dawn?\nIs it dusk?", 2)).toEqual(["Is it dawn?", "Is it dusk?"]);
  });

  it("dedupes identical candidates while preserving order", () => {
    expect(parseTitles("A\nA\nB\nA", 3)).toEqual(["A", "B"]);
  });
});
