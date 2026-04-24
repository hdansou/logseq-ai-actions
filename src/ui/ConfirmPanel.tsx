import type { FunctionComponent } from "preact";
import { useEffect } from "preact/hooks";

/**
 * Minimal confirmation panel used when the action's output is additive
 * (e.g. `append-children` inserting new child blocks). Simpler than
 * `DiffPanel` because there's no "original" text being replaced —
 * just a preview of what will be added.
 */
export interface ConfirmPanelProps {
  readonly actionTitle: string;
  readonly message: string;
  readonly preview: string;
  readonly acceptLabel: string;
  readonly onAccept: () => void;
  readonly onReject: () => void;
}

export const ConfirmPanel: FunctionComponent<ConfirmPanelProps> = ({
  actionTitle,
  message,
  preview,
  acceptLabel,
  onAccept,
  onReject,
}) => {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onReject();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onAccept();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onAccept, onReject]);

  return (
    <div class="diff-root" role="dialog" aria-label={`${actionTitle} — confirm`}>
      <div class="diff-modal">
        <header class="diff-header">
          <strong>{actionTitle}</strong>
          <span class="diff-hint">
            <kbd>Esc</kbd> reject · <kbd>⌘ ↵</kbd> {acceptLabel.toLowerCase()}
          </span>
        </header>

        <section class="diag-body">
          <p class="diag-confirm-message">{message}</p>
          <pre class="diag-pre">{preview}</pre>
        </section>

        <footer class="diff-footer">
          <button type="button" class="diff-btn" onClick={onReject}>
            Reject
          </button>
          <button type="button" class="diff-btn diff-btn-primary" onClick={onAccept}>
            {acceptLabel}
          </button>
        </footer>
      </div>
    </div>
  );
};
