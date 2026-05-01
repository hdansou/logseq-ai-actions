import type { FunctionComponent } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Field } from "./Field";

interface ImportViewProps {
  readonly onCancel: () => void;
  readonly onImport: (rawJson: string) => void;
}

export const ImportView: FunctionComponent<ImportViewProps> = ({ onCancel, onImport }) => {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (text.trim().length > 0) onImport(text);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel, onImport, text]);

  return (
    <section class="manage-detail">
      <div class="manage-breadcrumb">
        <button type="button" class="manage-breadcrumb-link" onClick={onCancel}>
          ← Back to all actions
        </button>
        <span>/</span>
        <span>Import JSON</span>
      </div>

      <h2 class="manage-detail-title">Import actions from JSON</h2>

      <Field label="Paste a JSON array of actions">
        <textarea
          ref={textareaRef}
          class="manage-input manage-textarea"
          rows={14}
          value={text}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
          placeholder='[\n  {\n    "id": "action-items",\n    "title": "Action Items",\n    "scope": "subtree",\n    "outputMode": "append-children",\n    "systemPrompt": "Extract action items …"\n  }\n]'
          spellcheck={false}
        />
      </Field>

      <div class="manage-run-row">
        <button
          type="button"
          class="diff-btn diff-btn-primary"
          onClick={() => onImport(text)}
          disabled={text.trim().length === 0}
        >
          Import
        </button>
        <button type="button" class="diff-btn" onClick={onCancel}>
          Cancel
        </button>
        <span class="manage-run-spacer">
          <kbd>⌘ ↵</kbd> import · <kbd>esc</kbd> cancel
        </span>
      </div>
    </section>
  );
};
