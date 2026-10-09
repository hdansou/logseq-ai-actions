import type { FunctionComponent } from "preact";
import { useEffect, useMemo, useReducer, useRef } from "preact/hooks";
import { computeDiff } from "../diff";
import { LocalRemoteBadge } from "./LocalRemoteBadge";
import {
  initReview,
  progress,
  type ReviewEvent,
  type ReviewRow,
  reviewReducer,
  toWrite,
  visibleRows,
} from "./review-state";

export type ReviewWrite = ReturnType<typeof toWrite>[number];

export interface ReviewPanelProps {
  readonly actionTitle: string;
  /** What the run covers, e.g. "Page: Project X" or "3 selected blocks". */
  readonly scopeLabel: string;
  readonly baseUrl: string;
  readonly targets: readonly { uuid: string; text: string }[];
  /** Blocks left out of the run (empty, image, code, …). Shown in the header. */
  readonly skipped: number;
  /**
   * Runs the requests, reporting each block's progress through `dispatch`.
   * Must stop starting new requests once `signal` is aborted.
   */
  readonly run: (dispatch: (event: ReviewEvent) => void, signal: AbortSignal) => Promise<void>;
  readonly onApply: (writes: ReviewWrite[]) => void;
  readonly onClose: () => void;
}

const STATUS_TEXT: Partial<Record<ReviewRow["status"], string>> = {
  pending: "Waiting…",
  running: "Working…",
  cancelled: "Not run",
};

export const ReviewPanel: FunctionComponent<ReviewPanelProps> = (props) => {
  const { onApply, onClose } = props;
  const [state, dispatch] = useReducer(reviewReducer, props.targets, initReview);
  const controller = useRef(new AbortController());

  // Start the run once; abort it if the panel goes away mid-run.
  useEffect(() => {
    const ctl = controller.current;
    props.run(dispatch, ctl.signal).catch(() => dispatch({ type: "cancel" }));
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { done, total, finished } = progress(state);
  const rows = visibleRows(state);
  const writes = toWrite(state);
  const undecided = rows.some((r) => r.status === "changed" && r.decision === "undecided");

  const cancel = () => {
    dispatch({ type: "cancel" });
    controller.current.abort();
  };

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (finished) onClose();
      else cancel();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  return (
    <div class="diff-root" role="dialog" aria-label={`${props.actionTitle} — review changes`}>
      <div class="diff-modal">
        <header class="diff-header">
          <span class="diff-header-main">
            <strong>{props.actionTitle}</strong>
            <span class="review-scope">{props.scopeLabel}</span>
            <LocalRemoteBadge baseUrl={props.baseUrl} />
          </span>
          <span class="diff-hint" aria-live="polite">
            {finished ? `${done} of ${total} done` : `Working… ${done} of ${total}`}
            {props.skipped > 0 ? ` · ${props.skipped} skipped` : ""}
          </span>
        </header>

        <section class="review-body">
          {rows.length === 0 ? (
            <p class="review-empty">
              {finished ? "No changes suggested." : "Waiting for the first result…"}
            </p>
          ) : (
            <ol class="review-list">
              {rows.map((row) => (
                <ReviewRowItem key={row.uuid} row={row} dispatch={dispatch} />
              ))}
            </ol>
          )}
        </section>

        <footer class="diff-footer">
          {finished ? (
            <button type="button" class="diff-btn" onClick={onClose}>
              Close
            </button>
          ) : (
            <button type="button" class="diff-btn" onClick={cancel}>
              Cancel
            </button>
          )}
          <button
            type="button"
            class="diff-btn"
            disabled={!undecided}
            onClick={() => dispatch({ type: "accept-all" })}
          >
            Accept all
          </button>
          <button
            type="button"
            class="diff-btn diff-btn-primary"
            disabled={!finished || writes.length === 0}
            onClick={() => onApply(writes)}
          >
            {writes.length === 1 ? "Apply 1 change" : `Apply ${writes.length} changes`}
          </button>
        </footer>
      </div>
    </div>
  );
};

const ReviewRowItem: FunctionComponent<{
  row: ReviewRow;
  dispatch: (event: ReviewEvent) => void;
}> = ({ row, dispatch }) => {
  const segments = useMemo(
    () => (row.proposed === undefined ? null : computeDiff(row.original, row.proposed)),
    [row.original, row.proposed],
  );
  return (
    <li class="review-row" data-status={row.status} data-decision={row.decision}>
      <pre class="diff-pre review-text">
        {segments
          ? segments.map((seg, i) => (
              <span
                key={i}
                class={
                  seg.kind === "added" ? "diff-added" : seg.kind === "removed" ? "diff-removed" : ""
                }
              >
                {seg.value}
              </span>
            ))
          : row.original}
      </pre>
      {row.status === "changed" ? (
        <fieldset class="review-decision" aria-label="Keep this change?">
          <button
            type="button"
            class="review-choice"
            aria-pressed={row.decision === "rejected"}
            onClick={() => dispatch({ type: "reject", uuid: row.uuid })}
          >
            Reject
          </button>
          <button
            type="button"
            class="review-choice"
            aria-pressed={row.decision === "accepted"}
            onClick={() => dispatch({ type: "accept", uuid: row.uuid })}
          >
            Accept
          </button>
        </fieldset>
      ) : (
        <span class="review-status">
          {row.status === "error" ? row.error : STATUS_TEXT[row.status]}
        </span>
      )}
    </li>
  );
};
