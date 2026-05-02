import type { FunctionComponent } from "preact";
import { useEffect, useMemo } from "preact/hooks";
import type { Action } from "../action";
import { groupActionsForPicker, type TaggedAction } from "./picker-categories";

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

  const groups = useMemo(() => {
    // Tag each action with its provenance before grouping. The first
    // `builtinCount` entries are seed actions; everything after comes
    // from `userActionsJson`. The grouping helper carries the flag
    // through so the panel can render the `custom` pill on user cards.
    const tagged: TaggedAction[] = actions.map((a, i) => ({ ...a, isBuiltin: i < builtinCount }));
    return groupActionsForPicker(tagged);
  }, [actions, builtinCount]);
  const { subtitle, cardsDisabled } = derivePickerState(targetBlockUuid);

  return (
    <div class="diff-root" role="dialog" aria-label="Pick an AI action">
      <div class="diff-modal picker-modal">
        <header class="diff-header">
          <strong>AI Actions</strong>
          <span class={`diff-hint${cardsDisabled ? " diff-hint-warn" : ""}`}>{subtitle}</span>
        </header>
        <section class="picker-body">
          {groups.map((group) => (
            <div key={group.category} class="picker-group">
              <div class="picker-group-head">
                {group.label}
                <span class="picker-group-count">· {group.actions.length}</span>
              </div>
              <div class="picker-grid">
                {group.actions.map((a) => (
                  <PickerCard
                    key={a.id}
                    action={a}
                    disabled={cardsDisabled}
                    onClick={() => onPick(a)}
                  />
                ))}
              </div>
            </div>
          ))}
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

const PickerCard: FunctionComponent<{
  action: TaggedAction;
  disabled: boolean;
  onClick: () => void;
}> = ({ action, disabled, onClick }) => (
  <button
    type="button"
    class="picker-card"
    disabled={disabled}
    onClick={onClick}
    title={action.description}
  >
    <span class="picker-card-title">{action.title}</span>
    <span class="picker-card-pills">
      <span class="picker-pill">{action.scope}</span>
      <span class={`picker-pill${action.kind === "vision" ? " picker-pill-vision" : ""}`}>
        {action.outputMode}
      </span>
      {action.isBuiltin ? null : <span class="picker-pill picker-pill-custom">custom</span>}
    </span>
  </button>
);
