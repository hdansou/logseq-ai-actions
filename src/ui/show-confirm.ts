/// <reference types="@logseq/libs" />
import { h, render } from "preact";
import { ConfirmPanel } from "./ConfirmPanel";

export interface ShowConfirmOptions {
  readonly message: string;
  readonly preview: string;
  readonly acceptLabel?: string;
}

/**
 * Mount a small `ConfirmPanel` into the iframe's `#app`, show it via
 * `logseq.showMainUI`, resolve a Promise&lt;boolean&gt; on user action
 * (`true` on Accept, `false` on Reject / Escape).
 */
export function showConfirm(actionTitle: string, options: ShowConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const container = document.getElementById("app");
    if (!container) {
      resolve(true); // No mount point — auto-accept so we never silently reject.
      return;
    }
    const teardown = (result: boolean) => {
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
      h(ConfirmPanel, {
        actionTitle,
        message: options.message,
        preview: options.preview,
        acceptLabel: options.acceptLabel ?? "Accept",
        onAccept: () => teardown(true),
        onReject: () => teardown(false),
      }),
      container,
    );
    logseq.showMainUI();
  });
}
