import type { FunctionComponent } from "preact";
import { useEffect } from "preact/hooks";

interface UndoToastProps {
  readonly message: string;
  readonly onUndo: () => void;
  readonly onDismiss: () => void;
  /** Auto-dismiss after this many ms. Spec says ~2.5 s. */
  readonly durationMs?: number;
}

/**
 * Small overlay that surfaces the most recent hide/restore with an
 * Undo affordance. Auto-dismisses after `durationMs`; clicking Undo
 * dismisses immediately and invokes the parent's reverse callback.
 *
 * Mounts inside the Manage panel root, not at document level, so it
 * stacks correctly with the iframe modal and inherits the theme.
 */
export const UndoToast: FunctionComponent<UndoToastProps> = ({
  message,
  onUndo,
  onDismiss,
  durationMs = 2500,
}) => {
  useEffect(() => {
    const id = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(id);
  }, [onDismiss, durationMs]);

  return (
    <div class="manage-undo-toast" role="status">
      <span class="manage-undo-text">{message}</span>
      <button
        type="button"
        class="manage-undo-link"
        onClick={() => {
          onUndo();
          onDismiss();
        }}
      >
        Undo
      </button>
    </div>
  );
};
