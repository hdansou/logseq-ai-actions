import type { FunctionComponent } from "preact";
import { useEffect } from "preact/hooks";
import type { Action } from "../../action";
import { Field } from "./Field";
import { PillRadio } from "./PillRadio";
import { KIND_HINTS, OUTPUT_MODE_HINTS, SCOPE_HINTS } from "./types";

interface DetailReadonlyProps {
  readonly action: Action;
  readonly onBack: () => void;
  readonly onDuplicate: () => void;
}

export const DetailReadonly: FunctionComponent<DetailReadonlyProps> = ({
  action,
  onBack,
  onDuplicate,
}) => {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onBack();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onBack]);

  return (
    <section class="manage-detail">
      <div class="manage-breadcrumb">
        <button type="button" class="manage-breadcrumb-link" onClick={onBack}>
          ← Back to all actions
        </button>
        <span>/</span>
        <span>
          {action.title} <span class="manage-tag">built-in</span>
        </span>
      </div>

      <div class="manage-readonly-banner">
        <span aria-hidden="true">👁</span>
        <span>
          This is a built-in action — read-only. To customise, use{" "}
          <strong>Duplicate as user action</strong> (creates an editable copy with a new id) or
          shadow it by creating a user action with the id <code>{action.id}</code>.
        </span>
      </div>

      <h2 class="manage-detail-title">{action.title}</h2>

      <div class="manage-field-row">
        <Field label="Title">
          <input type="text" class="manage-input" disabled value={action.title} />
        </Field>
        <Field label="ID">
          <input type="text" class="manage-input" disabled value={action.id} />
        </Field>
      </div>

      <Field label="Description">
        <input type="text" class="manage-input" disabled value={action.description} />
      </Field>

      <div class="manage-field-row">
        <Field label="Scope" hint={SCOPE_HINTS[action.scope]}>
          <PillRadio
            name="scope"
            value={action.scope}
            disabled
            options={[
              { value: "selection", label: "selection" },
              { value: "block", label: "block" },
              { value: "subtree", label: "subtree" },
            ]}
          />
        </Field>
        <Field label="Kind" hint={KIND_HINTS[action.kind]}>
          <PillRadio
            name="kind"
            value={action.kind}
            disabled
            options={[
              { value: "text", label: "text" },
              { value: "vision", label: "vision" },
            ]}
          />
        </Field>
      </div>

      <Field label="Output mode" hint={OUTPUT_MODE_HINTS[action.outputMode]}>
        <input type="text" class="manage-input" disabled value={action.outputMode} />
      </Field>

      <div class="manage-field">
        <span class="manage-field-label">System prompt</span>
        <div class="manage-prompt-wrap">
          <textarea disabled value={action.systemPrompt} spellcheck={false} />
          <div class="manage-prompt-toolbar">
            <span>Chars: {action.systemPrompt.length}</span>
            <span>read-only · cannot edit built-in</span>
          </div>
        </div>
      </div>

      <div class="manage-run-row">
        <button type="button" class="diff-btn diff-btn-primary" onClick={onDuplicate}>
          ⧉ Duplicate as user action
        </button>
        <button type="button" class="diff-btn" onClick={onBack}>
          Back
        </button>
        <span class="manage-run-spacer">
          <kbd>esc</kbd> back
        </span>
      </div>
    </section>
  );
};
