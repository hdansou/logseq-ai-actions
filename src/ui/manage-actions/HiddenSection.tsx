import type { ComponentChildren, FunctionComponent } from "preact";

interface HiddenSectionProps {
  readonly count: number;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly children: ComponentChildren;
}

/**
 * Collapsible "Hidden" bin rendered at the bottom of the Manage Actions
 * panel. Shows a count badge and a helper subtitle explaining where the
 * hidden actions are no longer visible. Auto-expansion on search match
 * is handled by the parent panel; this component just renders the
 * current state.
 */
export const HiddenSection: FunctionComponent<HiddenSectionProps> = ({
  count,
  open,
  onToggle,
  children,
}) => {
  if (count === 0) return null;
  return (
    <section class={`manage-hidden-section${open ? " manage-hidden-open" : ""}`}>
      <button
        type="button"
        class="manage-hidden-toggle"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="manage-hidden-list"
      >
        <span class="manage-hidden-chev" aria-hidden="true">
          ▸
        </span>
        <span class="manage-hidden-label">Hidden</span>
        <span class="manage-hidden-count">{count}</span>
        <span class="manage-hidden-helper">
          Out of sight in the picker. Slash, palette, and context-menu entries clear on next plugin
          reload.
        </span>
      </button>
      {open ? (
        <div id="manage-hidden-list" class="manage-hidden-list">
          {children}
        </div>
      ) : null}
    </section>
  );
};
