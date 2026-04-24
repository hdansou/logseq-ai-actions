/// <reference types="@logseq/libs" />
import { h, render } from "preact";
import { ConfirmPanel } from "./ConfirmPanel";

export interface ShowConfirmOptions {
  readonly message: string;
  /** Optional preformatted preview below the message. Omit for plain notices. */
  readonly preview?: string;
  readonly acceptLabel?: string;
  readonly baseUrl?: string;
  /** When true, the Reject button is hidden — acknowledgement-only notices. */
  readonly hideReject?: boolean;
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
        acceptLabel: options.acceptLabel ?? "Accept",
        hideReject: options.hideReject ?? false,
        ...(options.preview !== undefined ? { preview: options.preview } : {}),
        ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
        onAccept: () => teardown(true),
        onReject: () => teardown(false),
      }),
      container,
    );
    logseq.showMainUI();
  });
}
