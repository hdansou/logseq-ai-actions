/// <reference types="@logseq/libs" />
import { h, render } from "preact";
import { debugLog } from "../debug-log";
import { DiagnosticsPanel } from "./DiagnosticsPanel";

/**
 * Mount the `DiagnosticsPanel` reading from the module-level `debugLog`
 * singleton, show the iframe, resolve when the user closes the panel.
 *
 * Carries the triple-slash SDK reference (runtime-gotchas §11); only
 * loaded from `src/index.ts`, never from a test.
 */
export function showDiagnostics(): Promise<void> {
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
    render(h(DiagnosticsPanel, { buffer: debugLog, onClose: teardown }), container);
    logseq.showMainUI();
  });
}
