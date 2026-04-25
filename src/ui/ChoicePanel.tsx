import type { FunctionComponent } from "preact";
import { useEffect } from "preact/hooks";
import { LocalRemoteBadge } from "./LocalRemoteBadge";

/**
 * Generic "pick one of N candidates" panel. Used by `picker-replace` output
 * mode (e.g. the image-title action: 3 LLM-generated titles + a "keep
 * current title" option). Sibling of ConfirmPanel — same modal chrome,
 * different body.
 */
export interface ChoicePanelChoice {
  /** Stable key (used as React/Preact `key` and as the resolved value). */
  readonly value: string;
  /** Primary line shown on the row button. */
  readonly label: string;
  /** Optional secondary line (e.g. "current title", index). */
  readonly subtitle?: string;
}

export interface ChoicePanelProps {
  readonly actionTitle: string;
  readonly message?: string;
  readonly choices: readonly ChoicePanelChoice[];
  readonly baseUrl?: string;
  /** Called with the chosen `value` when the user accepts a row. */
  readonly onAccept: (value: string) => void;
  /** Called when the user cancels (button or Esc). */
  readonly onCancel: () => void;
}

export const ChoicePanel: FunctionComponent<ChoicePanelProps> = ({
  actionTitle,
  message,
  choices,
  baseUrl,
  onAccept,
  onCancel,
}) => {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      // Number keys 1..N select the corresponding row.
      if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        const choice = choices[idx];
        if (choice) {
          e.preventDefault();
          onAccept(choice.value);
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [choices, onAccept, onCancel]);

  return (
    <div class="diff-root" role="dialog" aria-label={`${actionTitle} — choose`}>
      <div class="diff-modal picker-modal">
        <header class="diff-header">
          <span class="diff-header-main">
            <strong>{actionTitle}</strong>
            {baseUrl ? <LocalRemoteBadge baseUrl={baseUrl} /> : null}
          </span>
          <span class="diff-hint">
            <kbd>1</kbd>–<kbd>{Math.min(choices.length, 9)}</kbd> pick · <kbd>Esc</kbd> cancel
          </span>
        </header>

        <section class="picker-list">
          {message ? <p class="diag-confirm-message">{message}</p> : null}
          {choices.map((choice, idx) => (
            <button
              key={choice.value}
              type="button"
              class="picker-row"
              onClick={() => onAccept(choice.value)}
            >
              <span class="picker-row-header">
                <span class="picker-row-title">
                  <kbd>{idx + 1}</kbd> {choice.label}
                </span>
              </span>
              {choice.subtitle ? <span class="picker-row-desc">{choice.subtitle}</span> : null}
            </button>
          ))}
        </section>

        <footer class="diff-footer">
          <button type="button" class="diff-btn" onClick={onCancel}>
            Cancel
          </button>
        </footer>
      </div>
    </div>
  );
};
