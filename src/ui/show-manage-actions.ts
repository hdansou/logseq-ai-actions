import { h } from "preact";
import type { Action } from "../action";
import { ManageActionsPanel } from "./ManageActionsPanel";
import { mountPanel } from "./mount-panel";

export interface ShowManageActionsOptions {
  readonly builtin: readonly Action[];
  readonly initialUserActions: readonly Action[];
  readonly onSave: (userActions: readonly Action[]) => Promise<void>;
}

/**
 * Mount the `ManageActionsPanel`; resolve when the user closes the panel
 * (with or without saving). Persistence is via the `onSave` callback.
 */
export function showManageActions(options: ShowManageActionsOptions): Promise<void> {
  return mountPanel<void>(undefined, (teardown) =>
    h(ManageActionsPanel, {
      builtin: options.builtin,
      initialUserActions: options.initialUserActions,
      onSave: options.onSave,
      onClose: () => teardown(undefined),
    }),
  );
}
