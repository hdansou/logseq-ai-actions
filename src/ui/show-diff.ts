import { h } from "preact";
import { DiffPanel, type DiffPanelActionDesc, type RunAndStream } from "./DiffPanel";
import { mountPanel } from "./mount-panel";

export interface ShowDiffPanelOptions {
  readonly currentActionId: string;
  readonly actionTitle: string;
  readonly baseUrl: string;
  readonly original: string;
  readonly actions: readonly DiffPanelActionDesc[];
  /**
   * Invoked by the panel on mount (with `currentActionId`) and on any
   * action-bar click. Emits chunks via `onChunk`; resolves with the
   * trimmed final text + the (possibly different) action title.
   */
  readonly runAndStream: RunAndStream;
}

/**
 * Mount the `DiffPanel`, resolve with the accepted text on Accept or
 * `null` on Reject. Streaming without a DOM container is pointless, so
 * the no-mount fallback rejects.
 */
export function showDiffPanel(options: ShowDiffPanelOptions): Promise<string | null> {
  return mountPanel<string | null>(null, (teardown) =>
    h(DiffPanel, {
      currentActionId: options.currentActionId,
      actionTitle: options.actionTitle,
      baseUrl: options.baseUrl,
      original: options.original,
      actions: options.actions,
      runAndStream: options.runAndStream,
      onAccept: (text: string) => teardown(text),
      onReject: () => teardown(null),
    }),
  );
}
