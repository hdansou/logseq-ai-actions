import type { FunctionComponent } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { computeDiff, type DiffSegment } from "../diff";

export interface DiffPanelProps {
  readonly actionTitle: string;
  readonly original: string;
  readonly proposed: string;
  readonly onAccept: (text: string) => void;
  readonly onReject: () => void;
}

export const DiffPanel: FunctionComponent<DiffPanelProps> = ({
  actionTitle,
  original,
  proposed,
  onAccept,
  onReject,
}) => {
  const segments = useMemo(() => computeDiff(original, proposed), [original, proposed]);
  const [editedText, setEditedText] = useState(proposed);
  const [isEditing, setIsEditing] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
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
  }, [onAccept, onReject, isEditing, editedText, proposed]);

  useEffect(() => {
    if (isEditing) editRef.current?.focus();
  }, [isEditing]);

  return (
    <div class="diff-root" role="dialog" aria-label={`${actionTitle} — review changes`}>
      <div class="diff-modal">
        <header class="diff-header">
          <strong>{actionTitle}</strong>
          <span class="diff-hint">
            <kbd>Esc</kbd> reject · <kbd>⌘ ↵</kbd> accept
          </span>
        </header>

        <section class="diff-body">
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
                onInput={(e) => setEditedText((e.target as HTMLTextAreaElement).value)}
              />
            ) : (
              <pre class="diff-pre">{renderSide(segments, "proposed")}</pre>
            )}
          </div>
        </section>

        <footer class="diff-footer">
          <button type="button" class="diff-btn" onClick={onReject}>
            Reject
          </button>
          {isEditing ? (
            <button
              type="button"
              class="diff-btn"
              onClick={() => {
                setEditedText(proposed);
                setIsEditing(false);
              }}
            >
              Cancel edit
            </button>
          ) : (
            <button type="button" class="diff-btn" onClick={() => setIsEditing(true)}>
              Edit
            </button>
          )}
          <button
            type="button"
            class="diff-btn diff-btn-primary"
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
    // `key` via index is fine here — segments are regenerated on every
    // prop change so stable identity across renders doesn't matter.
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
