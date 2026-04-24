import type { FunctionComponent } from "preact";
import { useEffect } from "preact/hooks";
import type { Action } from "../action";

export interface ActionPickerPanelProps {
  readonly actions: readonly Action[];
  /**
   * Number of leading entries in `actions` that are built-ins. User
   * actions are the rest. Used to render a visual divider.
   */
  readonly builtinCount: number;
  readonly onPick: (action: Action) => void;
  readonly onManage: () => void;
  readonly onDiagnostics: () => void;
  readonly onClose: () => void;
}

/**
 * Toolbar-triggered discovery surface. One clickable row per registered
 * action, plus footer links for Manage Actions and Diagnostics. Primary
 * value is "new users see what the plugin can do without needing to
 * know the slash syntax or memorise palette labels."
 */
export const ActionPickerPanel: FunctionComponent<ActionPickerPanelProps> = ({
  actions,
  builtinCount,
  onPick,
  onManage,
  onDiagnostics,
  onClose,
}) => {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const builtins = actions.slice(0, builtinCount);
  const userActions = actions.slice(builtinCount);

  return (
    <div class="diff-root" role="dialog" aria-label="Pick an AI action">
      <div class="diff-modal picker-modal">
        <header class="diff-header">
          <strong>AI Actions</strong>
          <span class="diff-hint">Click to run on the current block</span>
        </header>
        <section class="picker-list">
          {builtins.map((a) => (
            <PickerRow key={a.id} action={a} onClick={() => onPick(a)} />
          ))}
          {userActions.length > 0 ? (
            <>
              <div class="picker-section-label">User-defined</div>
              {userActions.map((a) => (
                <PickerRow key={a.id} action={a} onClick={() => onPick(a)} />
              ))}
            </>
          ) : null}
        </section>
        <footer class="diff-footer">
          <button type="button" class="diff-btn" onClick={onClose}>
            Close
          </button>
          <button type="button" class="diff-btn" onClick={onDiagnostics}>
            Diagnostics…
          </button>
          <button type="button" class="diff-btn" onClick={onManage}>
            Manage actions…
          </button>
        </footer>
      </div>
    </div>
  );
};

const PickerRow: FunctionComponent<{ action: Action; onClick: () => void }> = ({
  action,
  onClick,
}) => (
  <button type="button" class="picker-row" onClick={onClick}>
    <div class="picker-row-header">
      <strong class="picker-row-title">{action.title}</strong>
      <span class="picker-row-meta">
        {action.scope} · {action.outputMode}
      </span>
    </div>
    {action.description ? <span class="picker-row-desc">{action.description}</span> : null}
  </button>
);
