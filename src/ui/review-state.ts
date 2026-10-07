/**
 * State of the multi-block review panel (REQUIREMENTS §18). Pure reducer: the
 * adapter dispatches progress events as each block's request finishes, the
 * panel dispatches the user's decisions, and `toWrite` lists what to save.
 */

export type RowStatus = "pending" | "running" | "changed" | "unchanged" | "error" | "cancelled";
export type Decision = "undecided" | "accepted" | "rejected";

export interface ReviewRow {
  readonly uuid: string;
  readonly original: string;
  readonly status: RowStatus;
  readonly decision: Decision;
  readonly proposed?: string;
  readonly error?: string;
}

export interface ReviewState {
  readonly rows: readonly ReviewRow[];
  readonly cancelled: boolean;
}

export type ReviewEvent =
  | { readonly type: "start"; readonly uuid: string }
  | { readonly type: "result"; readonly uuid: string; readonly output: string }
  | { readonly type: "fail"; readonly uuid: string; readonly error: string }
  | { readonly type: "accept"; readonly uuid: string }
  | { readonly type: "reject"; readonly uuid: string }
  | { readonly type: "accept-all" }
  | { readonly type: "cancel" };

const FINISHED: readonly RowStatus[] = ["changed", "unchanged", "error", "cancelled"];

export function initReview(targets: readonly { uuid: string; text: string }[]): ReviewState {
  return {
    rows: targets.map((t) => ({
      uuid: t.uuid,
      original: t.text,
      status: "pending",
      decision: "undecided",
    })),
    cancelled: false,
  };
}

function updateRow(
  state: ReviewState,
  uuid: string,
  change: (row: ReviewRow) => ReviewRow,
): ReviewState {
  return { ...state, rows: state.rows.map((r) => (r.uuid === uuid ? change(r) : r)) };
}

const decide = (decision: Decision) => (row: ReviewRow) =>
  row.status === "changed" ? { ...row, decision } : row;

export function reviewReducer(state: ReviewState, event: ReviewEvent): ReviewState {
  switch (event.type) {
    case "start":
    case "result":
    case "fail": {
      if (state.cancelled) return state;
      return updateRow(state, event.uuid, (row) => {
        if (event.type === "start") return { ...row, status: "running" };
        if (event.type === "fail") return { ...row, status: "error", error: event.error };
        const proposed = event.output.trim();
        return proposed === row.original.trim()
          ? { ...row, status: "unchanged" }
          : { ...row, status: "changed", proposed };
      });
    }
    case "accept":
      return updateRow(state, event.uuid, decide("accepted"));
    case "reject":
      return updateRow(state, event.uuid, decide("rejected"));
    case "accept-all":
      return {
        ...state,
        rows: state.rows.map((r) => (r.decision === "undecided" ? decide("accepted")(r) : r)),
      };
    case "cancel":
      return {
        cancelled: true,
        rows: state.rows.map((r) =>
          FINISHED.includes(r.status) ? r : { ...r, status: "cancelled" },
        ),
      };
  }
}

/** Rows the panel shows: everything except blocks the model left as they were. */
export function visibleRows(state: ReviewState): ReviewRow[] {
  return state.rows.filter((r) => r.status !== "unchanged");
}

export function progress(state: ReviewState): { done: number; total: number; finished: boolean } {
  const done = state.rows.filter((r) => FINISHED.includes(r.status)).length;
  return { done, total: state.rows.length, finished: done === state.rows.length };
}

/** Accepted changes, in document order — the only blocks the adapter writes. */
export function toWrite(
  state: ReviewState,
): { uuid: string; original: string; proposed: string }[] {
  return state.rows.flatMap((r) =>
    r.status === "changed" && r.decision === "accepted" && r.proposed !== undefined
      ? [{ uuid: r.uuid, original: r.original, proposed: r.proposed }]
      : [],
  );
}
