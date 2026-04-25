/// <reference types="@logseq/libs" />
import { h, render } from "preact";
import { ChoicePanel, type ChoicePanelChoice } from "./ChoicePanel";

export interface ShowChoiceOptions {
  readonly message?: string;
  readonly choices: readonly ChoicePanelChoice[];
  readonly baseUrl?: string;
}

/**
 * Mount a `ChoicePanel` into the iframe's `#app` and resolve a
 * Promise<string | null> with the chosen `value` (or `null` on cancel /
 * Escape). Mirrors `showConfirm` in shape and teardown.
 */
export function showChoice(
  actionTitle: string,
  options: ShowChoiceOptions,
): Promise<string | null> {
  return new Promise((resolve) => {
    const container = document.getElementById("app");
    if (!container) {
      resolve(null);
      return;
    }
    const teardown = (result: string | null) => {
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
      h(ChoicePanel, {
        actionTitle,
        choices: options.choices,
        ...(options.message !== undefined ? { message: options.message } : {}),
        ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
        onAccept: (value: string) => teardown(value),
        onCancel: () => teardown(null),
      }),
      container,
    );
    logseq.showMainUI();
  });
}
