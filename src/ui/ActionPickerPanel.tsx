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
  /**
   * UUID of the block focused at the moment the picker was triggered, or
   * `null` if the user clicked the toolbar without a focused block.
   * Captured by the toolbar handler before the iframe steals focus.
   * `null` switches the panel into a disabled empty state.
   */
  readonly targetBlockUuid: string | null;
  readonly onPick: (action: Action) => void;
  readonly onManage: () => void;
  readonly onDiagnostics: () => void;
  readonly onClose: () => void;
}

/** Header subtitle + card-disabled state derived from the captured block UUID. */
export function derivePickerState(uuid: string | null): {
  readonly subtitle: string;
  readonly cardsDisabled: boolean;
} {
  if (uuid === null) {
    return { subtitle: "Place your cursor in a block first.", cardsDisabled: true };
  }
  return { subtitle: "Click to run on the current block", cardsDisabled: false };
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
  targetBlockUuid,
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
  const { subtitle, cardsDisabled } = derivePickerState(targetBlockUuid);

  return (
    <div class="diff-root" role="dialog" aria-label="Pick an AI action">
      <div class="diff-modal picker-modal">
        <header class="diff-header">
          <strong>AI Actions</strong>
          <span class={`diff-hint${cardsDisabled ? " diff-hint-warn" : ""}`}>{subtitle}</span>
        </header>
        <section class="picker-list">
          {builtins.map((a) => (
            <PickerRow key={a.id} action={a} disabled={cardsDisabled} onClick={() => onPick(a)} />
          ))}
          {userActions.length > 0 ? (
            <>
              <div class="picker-section-label">User-defined</div>
              {userActions.map((a) => (
                <PickerRow
                  key={a.id}
                  action={a}
                  disabled={cardsDisabled}
                  onClick={() => onPick(a)}
                />
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

const PickerRow: FunctionComponent<{
  action: Action;
  disabled: boolean;
  onClick: () => void;
}> = ({ action, disabled, onClick }) => (
  <button type="button" class="picker-row" disabled={disabled} onClick={onClick}>
    <div class="picker-row-header">
      <strong class="picker-row-title">{action.title}</strong>
      <span class="picker-row-meta">
        {action.scope} · {action.outputMode}
      </span>
    </div>
    {action.description ? <span class="picker-row-desc">{action.description}</span> : null}
  </button>
);
