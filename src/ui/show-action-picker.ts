/// <reference types="@logseq/libs" />
import { h, render } from "preact";
import type { Action } from "../action";
import { ActionPickerPanel } from "./ActionPickerPanel";

export interface ShowActionPickerOptions {
  readonly actions: readonly Action[];
  readonly builtinCount: number;
}

export type PickerResult =
  | { kind: "action"; action: Action }
  | { kind: "manage" }
  | { kind: "diagnostics" }
  | { kind: "close" };

/**
 * Mount the `ActionPickerPanel`, show the iframe, resolve with the
 * user's choice (or `close`). Caller is responsible for dispatching on
 * the result — e.g., invoking `runAction` for `action`, opening
 * `showManageActions` for `manage`, etc.
 */
export function showActionPicker(opts: ShowActionPickerOptions): Promise<PickerResult> {
  return new Promise((resolve) => {
    const container = document.getElementById("app");
    if (!container) {
      resolve({ kind: "close" });
      return;
    }
    const teardown = (result: PickerResult) => {
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
      resolve(result);
    };
    render(
      h(ActionPickerPanel, {
        actions: opts.actions,
        builtinCount: opts.builtinCount,
        onPick: (action) => teardown({ kind: "action", action }),
        onManage: () => teardown({ kind: "manage" }),
        onDiagnostics: () => teardown({ kind: "diagnostics" }),
        onClose: () => teardown({ kind: "close" }),
      }),
      container,
    );
    logseq.showMainUI();
  });
}
