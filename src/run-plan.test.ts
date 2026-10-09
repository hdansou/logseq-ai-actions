import { describe, expect, it } from "vitest";
import {
  appliedMessage,
  capTargets,
  combinedPlacement,
  commandTarget,
  flattenTargets,
  MAX_COMBINED_CHARS,
  planRun,
} from "./run-plan";
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
    for (const id of ["key-points", "outline-replace", "outline-append", "improve"]) {
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

  it("refuses block actions that add blocks (they would overwrite each block on a page run)", () => {
    for (const outputMode of [
      "append-children",
      "outline-append",
      "outline-replace",
      "picker-replace",
    ] as const) {
      const plan = planRun({ ...seed("grammar"), outputMode });
      expect(plan.kind).toBe("unsupported");
    }
    expect(planRun({ ...seed("grammar"), outputMode: "replace" })).toEqual({ kind: "per-block" });
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

describe("appliedMessage", () => {
  it("counts applied changes", () => {
    expect(appliedMessage("Grammar", 1, 0)).toBe("Grammar: applied 1 change");
    expect(appliedMessage("Grammar", 3, 0)).toBe("Grammar: applied 3 changes");
  });

  it("reports blocks that failed to save", () => {
    expect(appliedMessage("Grammar", 2, 0, 1)).toBe(
      "Grammar: applied 2 changes; 1 block failed to save",
    );
    expect(appliedMessage("Grammar", 1, 1, 2)).toBe(
      "Grammar: applied 1 change; 1 block was edited during the run and left as is; 2 blocks failed to save",
    );
  });

  it("says when blocks were left alone because they changed during the run", () => {
    expect(appliedMessage("Grammar", 2, 1)).toBe(
      "Grammar: applied 2 changes; 1 block was edited during the run and left as is",
    );
    expect(appliedMessage("Grammar", 0, 2)).toBe(
      "Grammar: applied 0 changes; 2 blocks were edited during the run and left as is",
    );
  });
});

describe("commandTarget", () => {
  it("runs on the selection when two or more blocks are selected", () => {
    expect(commandTarget({ selected: 2, editing: false, page: true })).toBe("selection");
    expect(commandTarget({ selected: 3, editing: true, page: true })).toBe("selection");
  });

  it("keeps one selected block, or the block being edited, on the single-block path", () => {
    expect(commandTarget({ selected: 1, editing: false, page: true })).toBe("single");
    expect(commandTarget({ selected: 0, editing: true, page: true })).toBe("single");
  });

  it("runs on the page when nothing is selected or edited", () => {
    expect(commandTarget({ selected: 0, editing: false, page: true })).toBe("page");
  });

  it("has nothing to run on outside a page (e.g. the Journals home view)", () => {
    expect(commandTarget({ selected: 0, editing: false, page: false })).toBe("none");
  });
});

describe("combinedPlacement", () => {
  it("adds to the end of the page on a page run", () => {
    expect(combinedPlacement({ kind: "page", uuid: "p" }, "last-root")).toEqual({
      insert: { kind: "page-end", page: "p" },
      where: "at the end of the page",
    });
  });

  it("adds as the last child of a zoomed-in block, so it stays in view", () => {
    expect(combinedPlacement({ kind: "zoomed", uuid: "z" }, "z")).toEqual({
      insert: { kind: "last-child", parent: "z" },
      where: "at the end of the zoomed-in block",
    });
  });

  it("adds after the last top-level selected block on a selection run", () => {
    expect(combinedPlacement({ kind: "selection" }, "b3")).toEqual({
      insert: { kind: "after", sibling: "b3" },
      where: "after the selection",
    });
    expect(combinedPlacement({ kind: "selection" }, undefined).insert).toBeNull();
  });
});
