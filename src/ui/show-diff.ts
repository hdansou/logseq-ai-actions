/// <reference types="@logseq/libs" />
import { h, render } from "preact";
import { DiffPanel, type DiffPanelActionDesc, type RunAndStream } from "./DiffPanel";

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
 * Mount the `DiffPanel` into the plugin iframe's `#app` container,
 * call `logseq.showMainUI`, and resolve the returned Promise when the
 * user accepts (with the accepted text) or rejects (with `null`). The
 * iframe is hidden again via `logseq.hideMainUI` before resolving.
 *
 * Side-effectful by design — the panel lives in the iframe DOM and
 * depends on Logseq's main-UI visibility, so this module carries the
 * `/// <reference types="@logseq/libs" />` and is NOT imported by any
 * Vitest test (runtime-gotchas §11).
 */
export function showDiffPanel(options: ShowDiffPanelOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const container = document.getElementById("app");
    if (!container) {
      // No mount point — reject so caller falls through to the
      // non-streaming write path. Streaming without a DOM container is
      // pointless.
      resolve(null);
      return;
    }

    const teardown = (result: string | null) => {
      try {
        render(null, container);
      } catch {
        /* ignore — unmount best-effort */
      }
      try {
        logseq.hideMainUI();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    render(
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
      container,
    );

    logseq.showMainUI();
  });
}
