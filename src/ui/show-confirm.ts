import { h } from "preact";
import { ConfirmPanel } from "./ConfirmPanel";
import { mountPanel } from "./mount-panel";

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
 * Mount a small `ConfirmPanel` into the iframe, resolve `true` on Accept
 * and `false` on Reject / Escape. Auto-accepts (`true`) when there's no
 * mount point, so we never silently reject.
 */
export function showConfirm(actionTitle: string, options: ShowConfirmOptions): Promise<boolean> {
  return mountPanel<boolean>(true, (teardown) =>
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
  );
}
