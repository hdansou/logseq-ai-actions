import { describe, expect, it } from "vitest";
import html from "../../index.html?raw";
import panel from "./ChoicePanel.tsx?raw";

/**
 * Regression guard: ChoicePanel shipped with `picker-row*` classes that had no
 * CSS, so the picker rendered as bare browser buttons and the subtitle ran on
 * after the label ("Keep current titleA feature…"). Node has no DOM, so check
 * the contract directly: every class the panel uses must have a rule in
 * index.html.
 */
function classesUsedBy(source: string): string[] {
  const names = new Set<string>();
  for (const m of source.matchAll(/class="([^"]+)"/g)) {
    for (const name of (m[1] ?? "").split(/\s+/)) if (name) names.add(name);
  }
  return [...names].sort();
}

function hasRule(css: string, className: string): boolean {
  return new RegExp(`\\.${className}(?![\\w-])`).test(css);
}

describe("ChoicePanel styles", () => {
  it("uses at least the picker classes this guard is about", () => {
    expect(classesUsedBy(panel)).toEqual(expect.arrayContaining(["picker-row", "picker-list"]));
  });

  it.each(classesUsedBy(panel))("has a CSS rule for .%s", (className) => {
    expect(hasRule(html, className)).toBe(true);
  });
});
