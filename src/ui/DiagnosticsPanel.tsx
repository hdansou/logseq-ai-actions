import type { FunctionComponent } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { DebugLogEntry, RingBuffer } from "../debug-log";

export interface DiagnosticsPanelProps {
  readonly buffer: RingBuffer<DebugLogEntry>;
  readonly onClose: () => void;
}

export const DiagnosticsPanel: FunctionComponent<DiagnosticsPanelProps> = ({ buffer, onClose }) => {
  // Most-recent-first for display. Re-read from buffer on every explicit
  // refresh so Clear + re-invocations reflect correctly.
  const [entries, setEntries] = useState<readonly DebugLogEntry[]>(() =>
    [...buffer.entries()].reverse(),
  );
  const [status, setStatus] = useState<string>("");

  const refresh = () => setEntries([...buffer.entries()].reverse());

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const copyAll = async () => {
    const text = entries.map(formatEntry).join("\n\n---\n\n");
    try {
      await navigator.clipboard.writeText(text || "(no entries)");
      setStatus(`Copied ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`);
    } catch {
      setStatus("Clipboard write failed — select and copy manually");
    }
  };

  const clearAll = () => {
    buffer.clear();
    refresh();
    setStatus("Cleared");
  };

  return (
    <div class="diff-root" role="dialog" aria-label="Plugin diagnostics">
      <div class="diff-modal">
        <header class="diff-header">
          <strong>
            Diagnostics — {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </strong>
          <span class="diff-hint">Capacity {buffer.capacity} · in-memory only</span>
        </header>

        <section class="diag-body">
          {entries.length === 0 ? (
            <p class="diag-empty">
              No entries yet. Enable <strong>Debug log</strong> in plugin settings, then run an AI
              action.
            </p>
          ) : (
            entries.map((entry, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: entries render is
              // top-level + entries are never reordered between renders, so
              // index is stable for this list.
              <DiagnosticEntry entry={entry} key={i} />
            ))
          )}
        </section>

        <footer class="diff-footer">
          {status ? <span class="diag-status">{status}</span> : null}
          <button type="button" class="diff-btn" onClick={onClose}>
            Close
          </button>
          <button type="button" class="diff-btn" onClick={clearAll} disabled={entries.length === 0}>
            Clear all
          </button>
          <button
            type="button"
            class="diff-btn diff-btn-primary"
            onClick={copyAll}
            disabled={entries.length === 0}
          >
            Copy all
          </button>
        </footer>
      </div>
    </div>
  );
};

const DiagnosticEntry: FunctionComponent<{ entry: DebugLogEntry }> = ({ entry }) => (
  <article class="diag-entry">
    <header class="diag-entry-header">
      <code>
        {entry.actionId}{" "}
        <span class="diag-meta">
          ({entry.scope}, {entry.outputMode})
        </span>
      </code>
      <span class="diag-meta">
        {new Date(entry.timestamp).toLocaleTimeString()} · {entry.durationMs}ms · {entry.model}
      </span>
    </header>
    {entry.error ? (
      <pre class="diag-pre diag-error">{entry.error}</pre>
    ) : (
      <>
        <div class="diag-label">Request</div>
        <pre class="diag-pre">{entry.requestPreview}</pre>
        {entry.responsePreview !== undefined ? (
          <>
            <div class="diag-label">Response</div>
            <pre class="diag-pre">{entry.responsePreview}</pre>
          </>
        ) : null}
      </>
    )}
  </article>
);

/**
 * Serialise an entry to plain text for clipboard copy. Chosen to be
 * paste-into-bug-report friendly — one block per entry, divider between.
 */
function formatEntry(e: DebugLogEntry): string {
  const when = new Date(e.timestamp).toISOString();
  const lines = [
    `[${when}] ${e.actionId} (${e.scope}, ${e.outputMode}) — ${e.durationMs}ms`,
    `  model=${e.model}  baseUrl=${e.baseUrl}`,
  ];
  if (e.error) {
    lines.push(`  error: ${e.error}`);
  } else {
    lines.push(`  request: ${e.requestPreview}`);
    if (e.responsePreview !== undefined) lines.push(`  response: ${e.responsePreview}`);
  }
  return lines.join("\n");
}
