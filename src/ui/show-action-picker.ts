import { h } from "preact";
import type { Action } from "../action";
import { ActionPickerPanel } from "./ActionPickerPanel";
import { mountPanel } from "./mount-panel";

export interface ShowActionPickerOptions {
  readonly actions: readonly Action[];
  readonly builtinCount: number;
  /**
   * UUID of the block focused when the picker was triggered, or `null`
   * if no block was focused. Captured by the toolbar handler before the
   * iframe steals focus; threaded through to `runAction` as
   * `explicitBlockUuid` once an action is picked. `null` flips the panel
   * into a disabled empty state.
   */
  readonly targetBlockUuid: string | null;
}

export type PickerResult =
  | { kind: "action"; action: Action }
  | { kind: "manage" }
  | { kind: "diagnostics" }
  | { kind: "close" };

/**
 * Mount the `ActionPickerPanel` and resolve with the user's choice (or
 * `close`). Caller dispatches on the result.
 */
export function showActionPicker(opts: ShowActionPickerOptions): Promise<PickerResult> {
  return mountPanel<PickerResult>({ kind: "close" }, (teardown) =>
    h(ActionPickerPanel, {
      actions: opts.actions,
      builtinCount: opts.builtinCount,
      targetBlockUuid: opts.targetBlockUuid,
      onPick: (action) => teardown({ kind: "action", action }),
      onManage: () => teardown({ kind: "manage" }),
      onDiagnostics: () => teardown({ kind: "diagnostics" }),
      onClose: () => teardown({ kind: "close" }),
    }),
  );
}
