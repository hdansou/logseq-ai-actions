import type { FunctionComponent } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { computeDiff, type DiffSegment } from "../diff";
import { LocalRemoteBadge } from "./LocalRemoteBadge";

/** One action surfaced in the panel's top bar. */
export interface DiffPanelActionDesc {
  readonly id: string;
  readonly title: string;
}

/**
 * Streaming callback shape shared by initial mount + action-bar re-run.
 * Invokes `onChunk` per delta as the LLM streams tokens; resolves with
 * the trimmed final text + the (possibly new) action title once the
 * stream ends.
 */
export type RunAndStream = (
  actionId: string,
  onChunk: (chunk: string) => void,
) => Promise<{ finalText: string; actionTitle: string }>;

export interface DiffPanelProps {
  /** Action whose proposal is currently displayed. Its button is highlighted + disabled. */
  readonly currentActionId: string;
  /** Title shown in the header; updates when the user picks a different action from the bar. */
  readonly actionTitle: string;
  /** Endpoint URL — rendered as a LOCAL/REMOTE badge in the header. */
  readonly baseUrl: string;
  readonly original: string;
  /** Buttons rendered in the top bar. Empty array hides the bar entirely. */
  readonly actions: readonly DiffPanelActionDesc[];
  /**
   * Start (or re-start) a stream for the given action id. Mount-time
   * and action-bar clicks both go through this — the panel never sees
   * a pre-resolved proposed string.
   */
  readonly runAndStream: RunAndStream;
  readonly onAccept: (text: string) => void;
  readonly onReject: () => void;
}

export const DiffPanel: FunctionComponent<DiffPanelProps> = (props) => {
  const { original, actions, onAccept, onReject, runAndStream } = props;

  const [currentActionId, setCurrentActionId] = useState(props.currentActionId);
  const [actionTitle, setActionTitle] = useState(props.actionTitle);
  const [proposed, setProposed] = useState("");
  const [editedText, setEditedText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isStreaming, setIsStreaming] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  // Generation counter so stale chunks from a prior stream (post action-bar
  // switch) don't bleed into the new proposal.
  const streamGen = useRef(0);

  // Diff highlights only make sense after the stream has finished — mid-
  // stream, "removed" segments would light up the whole Original column
  // just because the Proposed side is still short. Plain text during
  // streaming, full diff after.
  const segments = useMemo<readonly DiffSegment[] | null>(
    () => (isStreaming ? null : computeDiff(original, proposed)),
    [original, proposed, isStreaming],
  );

  const startStream = async (actionId: string): Promise<void> => {
    streamGen.current += 1;
    const myGen = streamGen.current;
    setProposed("");
    setEditedText("");
    setIsEditing(false);
    setIsStreaming(true);
    setErrorMessage(null);
    setCurrentActionId(actionId);
    try {
      const result = await runAndStream(actionId, (chunk) => {
        if (streamGen.current !== myGen) return;
        setProposed((prev) => prev + chunk);
      });
      if (streamGen.current !== myGen) return;
      // Sync to the provider's trimmed final text — per-chunk accumulation
      // may have leading/trailing whitespace the provider strips.
      setProposed(result.finalText);
      setEditedText(result.finalText);
      setActionTitle(result.actionTitle);
    } catch (err) {
      if (streamGen.current !== myGen) return;
      setErrorMessage((err as Error).message || "Stream failed");
    } finally {
      if (streamGen.current === myGen) setIsStreaming(false);
    }
  };

  // Intentional empty-dep useEffect: fire the initial stream ONCE on
  // mount. Subsequent streams come from action-bar clicks.
  useEffect(() => {
    void startStream(props.currentActionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (isStreaming) return;
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
  }, [onAccept, onReject, isEditing, editedText, proposed, isStreaming]);

  useEffect(() => {
    if (isEditing) editRef.current?.focus();
  }, [isEditing]);

  const handleBarClick = async (actionId: string) => {
    if (actionId === currentActionId || isStreaming) return;
    if (isEditing && editedText !== proposed) {
      const ok = window.confirm("Discard your edits and re-run with a different action?");
      if (!ok) return;
    }
    await startStream(actionId);
  };

  const busy = isStreaming;

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
                  disabled={isCurrent || busy}
                  onClick={() => void handleBarClick(a.id)}
                >
                  {a.title}
                </button>
              );
            })}
            {isStreaming ? <span class="diff-action-status">Streaming…</span> : null}
            {errorMessage ? (
              <span class="diff-action-status diff-action-error">{errorMessage}</span>
            ) : null}
          </div>
        ) : null}

        <section class={`diff-body${busy ? " diff-body-loading" : ""}`}>
          <div class="diff-column">
            <h4>Original</h4>
            <pre class="diff-pre">
              {segments === null ? original : renderSide(segments, "original")}
            </pre>
          </div>
          <div class="diff-column">
            <h4>{isEditing ? "Proposed (editing)" : "Proposed"}</h4>
            {isEditing ? (
              <textarea
                ref={editRef}
                class="diff-edit"
                value={editedText}
                disabled={busy}
                onInput={(e) => setEditedText((e.target as HTMLTextAreaElement).value)}
              />
            ) : (
              <pre class="diff-pre">
                {segments === null
                  ? proposed || (isStreaming ? "…" : "")
                  : renderSide(segments, "proposed")}
              </pre>
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
              disabled={busy}
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
              disabled={busy || proposed.length === 0}
              onClick={() => setIsEditing(true)}
            >
              Edit
            </button>
          )}
          <button
            type="button"
            class="diff-btn diff-btn-primary"
            disabled={busy || proposed.length === 0}
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
