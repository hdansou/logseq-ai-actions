import type { FunctionComponent } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { computeDiff, type DiffSegment } from "../diff";
import { ConfirmOverlay } from "./ConfirmOverlay";
import { LocalRemoteBadge } from "./LocalRemoteBadge";

/** One action surfaced in the panel's top bar. */
export interface DiffPanelActionDesc {
  readonly id: string;
  readonly title: string;
}

/**
 * Rendered entry in the action bar — either a single chip (button) or
 * a grouped chip with a dropdown (used to collapse the Rewrite tones).
 */
export type DiffPanelBarItem =
  | { readonly kind: "single"; readonly id: string; readonly title: string }
  | {
      readonly kind: "group";
      readonly groupId: string;
      readonly label: string;
      readonly items: readonly DiffPanelActionDesc[];
    };

/**
 * Bucket Rewrite tones (`rewrite`, `rewrite-formal`, `rewrite-professional`,
 * `rewrite-casual`, `rewrite-friendly`, plus any user-defined `rewrite-*`)
 * into a single "Rewrite" group chip; render the rest as standalone chips.
 * Keeps the chip row compact as more tones are added.
 *
 * The group is inserted at the position of the first rewrite-* action so
 * the surrounding order is preserved.
 */
export function partitionBarItems(
  actions: readonly DiffPanelActionDesc[],
): readonly DiffPanelBarItem[] {
  const isRewrite = (id: string) => id === "rewrite" || id.startsWith("rewrite-");
  const rewrites = actions.filter((a) => isRewrite(a.id));
  if (rewrites.length < 2) {
    // 0 or 1 rewrite — no point in a dropdown; render as singles.
    return actions.map((a) => ({ kind: "single", id: a.id, title: a.title }));
  }
  const out: DiffPanelBarItem[] = [];
  let groupEmitted = false;
  for (const a of actions) {
    if (isRewrite(a.id)) {
      if (!groupEmitted) {
        out.push({ kind: "group", groupId: "rewrite", label: "Rewrite", items: rewrites });
        groupEmitted = true;
      }
      continue;
    }
    out.push({ kind: "single", id: a.id, title: a.title });
  }
  return out;
}

/**
 * Short label for a rewrite-tone item inside the dropdown menu. The chip
 * already says "Rewrite", so showing "Rewrite Formal" again would just
 * be redundant — strip the prefix and use "Default" for the bare action.
 */
export function rewriteMenuLabel(title: string): string {
  if (title === "Rewrite") return "Default";
  return title.replace(/^Rewrite\s+/, "");
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
  const [pendingSwitchActionId, setPendingSwitchActionId] = useState<string | null>(null);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const groupWrapRef = useRef<HTMLDivElement>(null);
  // Generation counter so stale chunks from a prior stream (post action-bar
  // switch) don't bleed into the new proposal.
  const streamGen = useRef(0);

  const barItems = useMemo(() => partitionBarItems(actions), [actions]);

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

  // Close the open group menu on outside click or Escape. Mirrors the
  // pattern used by `OverflowMenu` in the Manage Actions panel.
  useEffect(() => {
    if (openGroupId === null) return;
    function handleClick(e: MouseEvent) {
      if (groupWrapRef.current && !groupWrapRef.current.contains(e.target as Node)) {
        setOpenGroupId(null);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenGroupId(null);
    }
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [openGroupId]);

  const handleBarClick = async (actionId: string) => {
    if (actionId === currentActionId || isStreaming) return;
    if (isEditing && editedText !== proposed) {
      // Defer the switch behind a styled overlay — we can't synchronously
      // block here without `window.confirm`, which jars inside the iframe.
      setPendingSwitchActionId(actionId);
      return;
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

        {barItems.length > 0 ? (
          <div class="diff-action-bar" role="toolbar" aria-label="Switch action">
            {barItems.map((item) => {
              if (item.kind === "single") {
                const isCurrent = item.id === currentActionId;
                return (
                  <button
                    type="button"
                    key={item.id}
                    class={`diff-action-btn${isCurrent ? " diff-action-btn-current" : ""}`}
                    disabled={isCurrent || busy}
                    onClick={() => void handleBarClick(item.id)}
                  >
                    {item.title}
                  </button>
                );
              }
              const isOpen = openGroupId === item.groupId;
              const containsCurrent = item.items.some((m) => m.id === currentActionId);
              return (
                <div key={item.groupId} class="diff-action-group" ref={groupWrapRef}>
                  <button
                    type="button"
                    class={`diff-action-btn${containsCurrent ? " diff-action-btn-current" : ""}`}
                    disabled={busy}
                    aria-haspopup="menu"
                    aria-expanded={isOpen}
                    onClick={() => setOpenGroupId(isOpen ? null : item.groupId)}
                  >
                    {item.label}
                    <span class="diff-action-caret" aria-hidden="true">
                      ▾
                    </span>
                  </button>
                  {isOpen ? (
                    <div class="diff-action-menu" role="menu">
                      {item.items.map((m) => {
                        const isCurrent = m.id === currentActionId;
                        return (
                          <button
                            type="button"
                            key={m.id}
                            role="menuitem"
                            class={`diff-action-menu-item${isCurrent ? " diff-action-menu-item-current" : ""}`}
                            disabled={isCurrent || busy}
                            onClick={() => {
                              setOpenGroupId(null);
                              void handleBarClick(m.id);
                            }}
                          >
                            {rewriteMenuLabel(m.title)}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
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

        {pendingSwitchActionId !== null ? (
          <ConfirmOverlay
            title="Discard your edits?"
            message="Switching to a different action will replace your edited text with a fresh proposal."
            confirmLabel="Discard and switch"
            danger
            onCancel={() => setPendingSwitchActionId(null)}
            onConfirm={() => {
              const id = pendingSwitchActionId;
              setPendingSwitchActionId(null);
              if (id !== null) void startStream(id);
            }}
          />
        ) : null}
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
