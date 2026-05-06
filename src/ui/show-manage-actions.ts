import { h } from "preact";
import type { Action } from "../action";
import { ManageActionsPanel } from "./manage-actions/ManageActionsPanel";
import { mountPanel } from "./mount-panel";

export interface ShowManageActionsOptions {
  readonly builtin: readonly Action[];
  readonly initialUserActions: readonly Action[];
  readonly onSave: (userActions: readonly Action[]) => Promise<void>;
  readonly initialHiddenActionIds: readonly string[];
  readonly onSaveVisibility: (hiddenActionIds: readonly string[]) => Promise<void>;
}

/**
 * Mount the `ManageActionsPanel`; resolve when the user closes the panel
 * (with or without saving). Persistence is via the `onSave` callback for
 * user-action edits and `onSaveVisibility` for hide/restore mutations
 * (the latter autosaves on every change — no Save / Cancel ceremony).
 */
export function showManageActions(options: ShowManageActionsOptions): Promise<void> {
  return mountPanel<void>(undefined, (teardown) =>
    h(ManageActionsPanel, {
      builtin: options.builtin,
      initialUserActions: options.initialUserActions,
      onSave: options.onSave,
      initialHiddenActionIds: options.initialHiddenActionIds,
      onSaveVisibility: options.onSaveVisibility,
      onClose: () => teardown(undefined),
    }),
  );
}
