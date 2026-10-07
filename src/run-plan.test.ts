import { describe, expect, it } from "vitest";
import { capTargets, flattenTargets, MAX_COMBINED_CHARS, planRun } from "./run-plan";
import { findSeedAction } from "./seed-actions";
import type { Target } from "./targets";

const seed = (id: string) => {
  const action = findSeedAction(id);
  if (!action) throw new Error(`unknown action ${id}`);
  return action;
};

const t = (uuid: string, text: string, depth = 0): Target => ({ uuid, text, depth });

describe("planRun", () => {
  it("runs block-scope text actions once per block", () => {
    for (const id of ["spellcheck", "grammar", "rewrite", "rewrite-formal"]) {
      expect(planRun(seed(id))).toEqual({ kind: "per-block" });
    }
  });

  it("runs Summarize once over all targets and appends its text as one block", () => {
    expect(planRun(seed("summarize"))).toEqual({ kind: "combined", result: "block" });
  });

  it("appends Key Points and both Outline modes as children of a new heading block", () => {
    for (const id of ["key-points", "outline-replace", "outline-append"]) {
      const action = seed(id);
      expect(planRun(action)).toEqual({
        kind: "combined",
        result: "children",
        heading: action.title,
      });
    }
  });

  it("does not run vision actions on pages or selections", () => {
    expect(planRun(seed("image-title")).kind).toBe("unsupported");
    expect(planRun(seed("extract-image-text")).kind).toBe("unsupported");
  });

  it("treats custom selection-scope actions as per-block", () => {
    expect(planRun({ ...seed("grammar"), scope: "selection" })).toEqual({ kind: "per-block" });
  });
});

describe("flattenTargets", () => {
  it("renders targets as one outline, indented by depth", () => {
    expect(
      flattenTargets([
        t("a", "Plan"),
        t("b", "Hire", 1),
        t("c", "Two engineers", 2),
        t("d", "Ship"),
      ]),
    ).toBe("- Plan\n  - Hire\n    - Two engineers\n- Ship");
  });
});

describe("capTargets", () => {
  const many = Array.from({ length: 60 }, (_, i) => t(`b${i}`, `Block ${i}`));

  it("keeps everything under the cap", () => {
    expect(capTargets(many.slice(0, 50), "per-block")).toEqual({
      targets: many.slice(0, 50),
      capped: false,
    });
  });

  it("keeps the first 50 blocks of a per-block run", () => {
    const out = capTargets(many, "per-block");
    expect(out.capped).toBe(true);
    expect(out.targets.map((x) => x.uuid)).toEqual(many.slice(0, 50).map((x) => x.uuid));
  });

  it("keeps a combined run's input within the character budget, whole blocks only", () => {
    const big = Array.from({ length: 10 }, (_, i) => t(`k${i}`, "x".repeat(1000)));
    const out = capTargets(big, "combined");
    expect(out.capped).toBe(true);
    expect(out.targets.length).toBeGreaterThan(0);
    expect(flattenTargets(out.targets).length).toBeLessThanOrEqual(MAX_COMBINED_CHARS);
    expect(flattenTargets(big.slice(0, out.targets.length + 1)).length).toBeGreaterThan(
      MAX_COMBINED_CHARS,
    );
  });

  it("keeps at least the first block of a combined run even if it alone is over budget", () => {
    const out = capTargets(
      [t("huge", "y".repeat(MAX_COMBINED_CHARS + 10)), t("next", "z")],
      "combined",
    );
    expect(out).toEqual({
      targets: [t("huge", "y".repeat(MAX_COMBINED_CHARS + 10))],
      capped: true,
    });
  });
});
