import { h } from "preact";
import { debugLog } from "../debug-log";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { mountPanel } from "./mount-panel";

/**
 * Mount the `DiagnosticsPanel` reading from the module-level `debugLog`
 * singleton; resolves when the user closes the panel.
 */
export function showDiagnostics(): Promise<void> {
  return mountPanel<void>(undefined, (teardown) =>
    h(DiagnosticsPanel, { buffer: debugLog, onClose: () => teardown(undefined) }),
  );
}
