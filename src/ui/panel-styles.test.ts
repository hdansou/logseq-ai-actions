import { describe, expect, it } from "vitest";
import html from "../../index.html?raw";
import choicePanel from "./ChoicePanel.tsx?raw";
import reviewPanel from "./ReviewPanel.tsx?raw";

/**
 * Regression guard: ChoicePanel shipped with `picker-row*` classes that had no
 * CSS, so the picker rendered as bare browser buttons and the subtitle ran on
 * after the label ("Keep current titleA feature…"). Node has no DOM, so check
 * the contract directly: every class a panel uses must have a rule in
 * index.html. Only literal `class="…"` attributes are seen, so panels show
 * state through data-/aria- attributes rather than computed class names.
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

const PANELS = {
  ChoicePanel: { source: choicePanel, expected: ["picker-row", "picker-list"] },
  ReviewPanel: { source: reviewPanel, expected: ["review-row", "review-list", "review-choice"] },
};

describe.each(Object.entries(PANELS))("%s styles", (_name, { source, expected }) => {
  it("uses at least the classes this guard is about", () => {
    expect(classesUsedBy(source)).toEqual(expect.arrayContaining(expected));
  });

  it.each(classesUsedBy(source))("has a CSS rule for .%s", (className) => {
    expect(hasRule(html, className)).toBe(true);
  });
});
