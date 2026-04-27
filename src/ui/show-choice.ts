import { h } from "preact";
import { ChoicePanel, type ChoicePanelChoice } from "./ChoicePanel";
import { mountPanel } from "./mount-panel";

export interface ShowChoiceOptions {
  readonly message?: string;
  readonly choices: readonly ChoicePanelChoice[];
  readonly baseUrl?: string;
}

/**
 * Mount a `ChoicePanel` into the iframe and resolve with the chosen
 * `value` (or `null` on cancel / Escape).
 */
export function showChoice(
  actionTitle: string,
  options: ShowChoiceOptions,
): Promise<string | null> {
  return mountPanel<string | null>(null, (teardown) =>
    h(ChoicePanel, {
      actionTitle,
      choices: options.choices,
      ...(options.message !== undefined ? { message: options.message } : {}),
      ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
      onAccept: (value: string) => teardown(value),
      onCancel: () => teardown(null),
    }),
  );
}
