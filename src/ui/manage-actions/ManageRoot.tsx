import type { ComponentChildren, FunctionComponent } from "preact";

export const ManageRoot: FunctionComponent<{
  label: string;
  /** Optional element rendered in the header just before the "Esc close" hint
   * (used for the "..." overflow menu in the gallery view). */
  headerExtra?: ComponentChildren;
  children: ComponentChildren;
}> = ({ label, headerExtra, children }) => (
  <div class="diff-root" role="dialog" aria-label={label}>
    <div class="diff-modal manage-modal">
      <header class="diff-header">
        <strong>{label}</strong>
        <span class="diff-hint" style="display:inline-flex;align-items:center;gap:8px;">
          {headerExtra}
          <span>
            <kbd>Esc</kbd> close
          </span>
        </span>
      </header>
      {children}
    </div>
  </div>
);
