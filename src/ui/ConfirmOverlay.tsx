import type { FunctionComponent } from "preact";
import { useEffect } from "preact/hooks";

/**
 * In-modal confirmation overlay used inside other panels (Manage Actions,
 * Diff Panel) where mounting another `showConfirm` would unmount the
 * parent. Uses the same `manage-confirm-*` CSS that `DeleteOverlay` did,
 * so themes carry over without new styles.
 *
 * Esc cancels. Enter confirms. Pass `danger` for destructive prompts.
 */
export interface ConfirmOverlayProps {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly danger?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export const ConfirmOverlay: FunctionComponent<ConfirmOverlayProps> = ({
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onConfirm, onCancel]);

  return (
    <div class="manage-confirm-overlay" role="alertdialog" aria-label={title}>
      <div class="manage-confirm-card">
        <h3>{title}</h3>
        <p>{message}</p>
        <div class="manage-confirm-actions">
          <button type="button" class="diff-btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            class={`diff-btn ${danger ? "diff-btn-danger" : "diff-btn-primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
