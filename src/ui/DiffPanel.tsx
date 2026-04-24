import type { FunctionComponent } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { computeDiff, type DiffSegment } from "../diff";
import { LocalRemoteBadge } from "./LocalRemoteBadge";

/** One action surfaced in the panel's top bar. */
export interface DiffPanelActionDesc {
  readonly id: string;
  readonly title: string;
}

export interface DiffPanelProps {
  /** Action whose proposal is currently displayed. Its button is highlighted + disabled. */
  readonly currentActionId: string;
  /** Title shown in the header. Updates when the user picks a different action from the bar. */
  readonly actionTitle: string;
  /** Endpoint URL — rendered as a LOCAL/REMOTE badge in the header. */
  readonly baseUrl: string;
  readonly original: string;
  readonly proposed: string;
  /** Buttons rendered in the top bar. Empty array hides the bar entirely. */
  readonly actions: readonly DiffPanelActionDesc[];
  /**
   * Called when the user clicks a different action in the bar. Return the
   * new proposed text + the new action's title. The component swaps
   * internal state to display it. Throws → error message shown, previous
   * proposal retained.
   */
  readonly onReRun: (actionId: string) => Promise<{ proposed: string; actionTitle: string }>;
  readonly onAccept: (text: string) => void;
  readonly onReject: () => void;
}

export const DiffPanel: FunctionComponent<DiffPanelProps> = (props) => {
  const { original, actions, onAccept, onReject, onReRun } = props;

  // Internal state so re-runs can swap the proposal without the caller
  // re-mounting the component. Initialised from props on first render.
  const [currentActionId, setCurrentActionId] = useState(props.currentActionId);
  const [actionTitle, setActionTitle] = useState(props.actionTitle);
  const [proposed, setProposed] = useState(props.proposed);
  const [editedText, setEditedText] = useState(props.proposed);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const segments = useMemo(() => computeDiff(original, proposed), [original, proposed]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (isLoading) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onReject();
      } else if ((e.key === "Enter" && (e.metaKey || e.ctrlKey)) || e.key === "Return") {
        e.preventDefault();
        onAccept(isEditing ? editedText : proposed);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onAccept, onReject, isEditing, editedText, proposed, isLoading]);

  useEffect(() => {
    if (isEditing) editRef.current?.focus();
  }, [isEditing]);

  const handleReRun = async (actionId: string) => {
    if (actionId === currentActionId || isLoading) return;

    if (isEditing && editedText !== proposed) {
      const ok = window.confirm("Discard your edits and re-run with a different action?");
      if (!ok) return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await onReRun(actionId);
      setProposed(result.proposed);
      setEditedText(result.proposed);
      setCurrentActionId(actionId);
      setActionTitle(result.actionTitle);
      setIsEditing(false);
    } catch (err) {
      setErrorMessage((err as Error).message || "Re-run failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div class="diff-root" role="dialog" aria-label={`${actionTitle} — review changes`}>
      <div class="diff-modal">
        <header class="diff-header">
          <span class="diff-header-main">
            <strong>{actionTitle}</strong>
            <LocalRemoteBadge baseUrl={props.baseUrl} />
          </span>
          <span class="diff-hint">
            <kbd>Esc</kbd> reject · <kbd>⌘ ↵</kbd> accept
          </span>
        </header>

        {actions.length > 0 ? (
          <div class="diff-action-bar" role="toolbar" aria-label="Switch action">
            {actions.map((a) => {
              const isCurrent = a.id === currentActionId;
              return (
                <button
                  type="button"
                  key={a.id}
                  class={`diff-action-btn${isCurrent ? " diff-action-btn-current" : ""}`}
                  disabled={isCurrent || isLoading}
                  onClick={() => void handleReRun(a.id)}
                >
                  {a.title}
                </button>
              );
            })}
            {isLoading ? <span class="diff-action-status">Working…</span> : null}
            {errorMessage ? (
              <span class="diff-action-status diff-action-error">{errorMessage}</span>
            ) : null}
          </div>
        ) : null}

        <section class={`diff-body${isLoading ? " diff-body-loading" : ""}`}>
          <div class="diff-column">
            <h4>Original</h4>
            <pre class="diff-pre">{renderSide(segments, "original")}</pre>
          </div>
          <div class="diff-column">
            <h4>{isEditing ? "Proposed (editing)" : "Proposed"}</h4>
            {isEditing ? (
              <textarea
                ref={editRef}
                class="diff-edit"
                value={editedText}
                disabled={isLoading}
                onInput={(e) => setEditedText((e.target as HTMLTextAreaElement).value)}
              />
            ) : (
              <pre class="diff-pre">{renderSide(segments, "proposed")}</pre>
            )}
          </div>
        </section>

        <footer class="diff-footer">
          <button type="button" class="diff-btn" onClick={onReject} disabled={isLoading}>
            Reject
          </button>
          {isEditing ? (
            <button
              type="button"
              class="diff-btn"
              disabled={isLoading}
              onClick={() => {
                setEditedText(proposed);
                setIsEditing(false);
              }}
            >
              Cancel edit
            </button>
          ) : (
            <button
              type="button"
              class="diff-btn"
              disabled={isLoading}
              onClick={() => setIsEditing(true)}
            >
              Edit
            </button>
          )}
          <button
            type="button"
            class="diff-btn diff-btn-primary"
            disabled={isLoading}
            onClick={() => onAccept(isEditing ? editedText : proposed)}
          >
            Accept
          </button>
        </footer>
      </div>
    </div>
  );
};

function renderSide(segments: readonly DiffSegment[], side: "original" | "proposed") {
  return segments.map((seg, i) => {
    if (seg.kind === "same") {
      return <span key={i}>{seg.value}</span>;
    }
    if (side === "original" && seg.kind === "removed") {
      return (
        <span key={i} class="diff-removed">
          {seg.value}
        </span>
      );
    }
    if (side === "proposed" && seg.kind === "added") {
      return (
        <span key={i} class="diff-added">
          {seg.value}
        </span>
      );
    }
    return null;
  });
}
