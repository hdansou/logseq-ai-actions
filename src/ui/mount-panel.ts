/// <reference types="@logseq/libs" />
import type { ComponentChild } from "preact";
import { render } from "preact";

/** Resolve callback the panel invokes to dismiss itself. */
export type Teardown<T> = (result: T) => void;

/**
 * Shared iframe-panel lifecycle helper used by every `show-*.ts`.
 *
 * Each call site previously duplicated the same boilerplate: look up the
 * `#app` mount point, return a default if absent, define a teardown that
 * unmounts and hides the iframe, render, then `showMainUI`. This helper
 * collapses all that into one signature so changes to the iframe lifecycle
 * (e.g., extra cleanup, error swallowing tweaks) live in one place.
 *
 * `fallback` is returned synchronously when there's no mount point — every
 * existing call site had a "do something safe" default for that case
 * (auto-accept, return null, return close, etc.).
 *
 * Carries the triple-slash SDK reference (runtime-gotchas §11); never
 * imported from a Vitest test.
 */
export function mountPanel<T>(
  fallback: T,
  renderWith: (teardown: Teardown<T>) => ComponentChild,
): Promise<T> {
  return new Promise((resolve) => {
    const container = document.getElementById("app");
    if (!container) {
      resolve(fallback);
      return;
    }
    const teardown: Teardown<T> = (result) => {
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
    render(renderWith(teardown), container);
    logseq.showMainUI();
  });
}
