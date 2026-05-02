import { describe, expect, it } from "vitest";
import { derivePickerState } from "./ActionPickerPanel";

describe("derivePickerState", () => {
  it("returns the run-on-current-block subtitle and enables cards when a block is focused", () => {
    expect(derivePickerState("66392f10-deadbeef")).toEqual({
      subtitle: "Click to run on the current block",
      cardsDisabled: false,
    });
  });

  it("returns the empty-state subtitle and disables cards when no block is focused", () => {
    expect(derivePickerState(null)).toEqual({
      subtitle: "Place your cursor in a block first.",
      cardsDisabled: true,
    });
  });
});
