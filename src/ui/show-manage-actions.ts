/// <reference types="@logseq/libs" />
import { h, render } from "preact";
import type { Action } from "../action";
import { ManageActionsPanel } from "./ManageActionsPanel";

export interface ShowManageActionsOptions {
  readonly builtin: readonly Action[];
  readonly initialUserActions: readonly Action[];
  readonly onSave: (userActions: readonly Action[]) => Promise<void>;
}

/**
 * Mount the `ManageActionsPanel` into the plugin iframe's `#app`,
 * call `logseq.showMainUI`, and resolve when the user closes the
 * panel (with or without saving). Persistence is performed via the
 * `onSave` callback from the caller — the panel is display-only in
 * terms of side effects.
 *
 * Carries the triple-slash SDK reference (runtime-gotchas §11);
 * only loaded from `src/index.ts`, never from a test.
 */
export function showManageActions(options: ShowManageActionsOptions): Promise<void> {
  return new Promise((resolve) => {
    const container = document.getElementById("app");
    if (!container) {
      resolve();
      return;
    }
    const teardown = () => {
      try {
        render(null, container);
      } catch {
        /* ignore */
      }
      try {
        logseq.hideMainUI();
      } catch {
        /* ignore */
      }
      resolve();
    };
    render(
      h(ManageActionsPanel, {
        builtin: options.builtin,
        initialUserActions: options.initialUserActions,
        onSave: options.onSave,
        onClose: teardown,
      }),
      container,
    );
    logseq.showMainUI();
  });
}
