import { describe, expect, it } from "vitest";
import {
  initReview,
  progress,
  type ReviewState,
  reviewReducer,
  toWrite,
  visibleRows,
} from "./review-state";

const targets = [
  { uuid: "a", text: "Teh plan" },
  { uuid: "b", text: "All good." },
  { uuid: "c", text: "Its fine" },
];

const run = (...events: Parameters<typeof reviewReducer>[1][]): ReviewState =>
  events.reduce(reviewReducer, initReview(targets));

describe("review state", () => {
  it("starts with every block pending and nothing to write", () => {
    const s = initReview(targets);
    expect(s.rows.map((r) => r.status)).toEqual(["pending", "pending", "pending"]);
    expect(progress(s)).toEqual({ done: 0, total: 3, finished: false });
    expect(toWrite(s)).toEqual([]);
  });

  it("marks a block changed when the result differs, unchanged when it doesn't (ignoring edge whitespace)", () => {
    const s = run(
      { type: "start", uuid: "a" },
      { type: "result", uuid: "a", output: "The plan" },
      { type: "result", uuid: "b", output: "  All good.\n" },
    );
    expect(s.rows[0]).toMatchObject({
      status: "changed",
      proposed: "The plan",
      decision: "undecided",
    });
    expect(s.rows[1]?.status).toBe("unchanged");
  });

  it("hides unchanged blocks from the panel", () => {
    const s = run(
      { type: "result", uuid: "a", output: "The plan" },
      { type: "result", uuid: "b", output: "All good." },
    );
    expect(visibleRows(s).map((r) => r.uuid)).toEqual(["a", "c"]);
  });

  it("keeps going after a failed block and shows its error", () => {
    const s = run(
      { type: "fail", uuid: "a", error: "timeout" },
      { type: "result", uuid: "c", output: "It's fine" },
    );
    expect(s.rows[0]).toMatchObject({ status: "error", error: "timeout" });
    expect(s.rows[2]?.status).toBe("changed");
  });

  it("writes only accepted, changed blocks", () => {
    const s = run(
      { type: "result", uuid: "a", output: "The plan" },
      { type: "result", uuid: "c", output: "It's fine" },
      { type: "accept", uuid: "a" },
      { type: "reject", uuid: "c" },
    );
    expect(toWrite(s)).toEqual([{ uuid: "a", original: "Teh plan", proposed: "The plan" }]);
  });

  it("Accept all accepts every undecided changed block, leaving rejected ones alone", () => {
    const s = run(
      { type: "result", uuid: "a", output: "The plan" },
      { type: "result", uuid: "c", output: "It's fine" },
      { type: "reject", uuid: "a" },
      { type: "accept-all" },
    );
    expect(toWrite(s).map((w) => w.uuid)).toEqual(["c"]);
  });

  it("ignores accept / reject on a block that has no change", () => {
    const s = run(
      { type: "result", uuid: "b", output: "All good." },
      { type: "accept", uuid: "b" },
    );
    expect(s.rows[1]?.decision).toBe("undecided");
  });

  it("cancel stops pending and running blocks but keeps finished results reviewable", () => {
    const s = run(
      { type: "result", uuid: "a", output: "The plan" },
      { type: "start", uuid: "b" },
      { type: "cancel" },
    );
    expect(s.rows.map((r) => r.status)).toEqual(["changed", "cancelled", "cancelled"]);
    expect(s.cancelled).toBe(true);
    expect(progress(s).finished).toBe(true);
  });

  it("ignores a result that arrives after cancel", () => {
    const s = run({ type: "cancel" }, { type: "result", uuid: "a", output: "The plan" });
    expect(s.rows[0]?.status).toBe("cancelled");
  });

  it("counts progress over finished blocks", () => {
    const s = run(
      { type: "result", uuid: "a", output: "The plan" },
      { type: "fail", uuid: "b", error: "x" },
      { type: "start", uuid: "c" },
    );
    expect(progress(s)).toEqual({ done: 2, total: 3, finished: false });
  });
});
