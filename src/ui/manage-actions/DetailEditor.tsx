import type { FunctionComponent } from "preact";
import { useEffect } from "preact/hooks";
import { Field } from "./Field";
import { PillRadio } from "./PillRadio";
import {
  type DraftAction,
  KIND_HINTS,
  OUTPUT_MODE_HINTS,
  SCOPE_HINTS,
  suggestIdFromTitle,
} from "./types";

interface DetailEditorProps {
  readonly mode: "edit" | "create";
  readonly draft: DraftAction;
  readonly setDraft: (d: DraftAction) => void;
  readonly errors: Record<string, string>;
  readonly liveErrors: Record<string, string>;
  readonly errorCount: number;
  readonly onCancel: () => void;
  readonly onSave: () => void;
  readonly onDelete?: () => void;
}

export const DetailEditor: FunctionComponent<DetailEditorProps> = ({
  mode,
  draft,
  setDraft,
  errors,
  liveErrors,
  errorCount,
  onCancel,
  onSave,
  onDelete,
}) => {
  // Inputs use `liveErrors` for immediate field highlighting; the summary
  // banner only renders after a save attempt (`errors`) so users aren't
  // shouted at while still typing the title.
  const showSummary = Object.keys(errors).length > 0;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onSave();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel, onSave]);

  const update = (key: keyof DraftAction) => (e: Event) => {
    const value = (e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
    const next = { ...draft, [key]: value };
    // When creating a new action and the user hasn't manually typed an id,
    // suggest one from the title for them.
    if (mode === "create" && key === "title" && !draft.id) {
      next.id = suggestIdFromTitle(value);
    }
    setDraft(next);
  };

  const promptCharCount = draft.systemPrompt.length;
  const promptLineCount = draft.systemPrompt.split(/\r?\n/).length;

  return (
    <section class="manage-detail">
      <div class="manage-breadcrumb">
        <button type="button" class="manage-breadcrumb-link" onClick={onCancel}>
          ← Back to all actions
        </button>
        <span>/</span>
        <span>{mode === "create" ? "New action" : draft.title || "Edit action"}</span>
      </div>

      <h2 class="manage-detail-title">
        {mode === "create" ? "New action" : draft.title || "Edit action"}
      </h2>

      {showSummary ? (
        <div class="manage-error-summary" role="alert">
          <span aria-hidden="true">⚠</span>
          <div>
            <strong>
              {errorCount} issue{errorCount === 1 ? "" : "s"} to fix before saving:
            </strong>
            <ul>
              {Object.entries(errors).map(([field, msg]) => (
                <li key={field}>
                  <code>{field}</code>: {msg}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <Field label="Title (shown in menus)" error={liveErrors.title}>
        <input
          type="text"
          class="manage-input"
          value={draft.title}
          onInput={update("title")}
          placeholder="e.g. Summarize as tweet"
        />
      </Field>

      <Field label="ID (kebab-case; used in the slash command)" error={liveErrors.id}>
        <input
          type="text"
          class="manage-input"
          value={draft.id}
          onInput={update("id")}
          placeholder="auto-generated from title…"
          autocomplete="off"
          spellcheck={false}
        />
      </Field>

      <Field label="Description (optional)" error={liveErrors.description}>
        <input
          type="text"
          class="manage-input"
          value={draft.description}
          onInput={update("description")}
          placeholder="One short sentence shown in the gallery card and the diff-panel header"
        />
      </Field>

      <div class="manage-field-row">
        <Field label="Scope" error={liveErrors.scope} hint={SCOPE_HINTS[draft.scope]}>
          <PillRadio
            name="scope"
            value={draft.scope}
            onChange={(v) => setDraft({ ...draft, scope: v })}
            options={[
              { value: "selection", label: "selection" },
              { value: "block", label: "block" },
              { value: "subtree", label: "subtree" },
            ]}
          />
        </Field>
        <Field label="Kind" error={liveErrors.kind} hint={KIND_HINTS[draft.kind]}>
          <PillRadio
            name="kind"
            value={draft.kind}
            onChange={(v) => setDraft({ ...draft, kind: v })}
            options={[
              { value: "text", label: "text" },
              { value: "vision", label: "vision" },
            ]}
          />
        </Field>
      </div>

      <Field
        label="Output mode"
        error={liveErrors.outputMode}
        hint={OUTPUT_MODE_HINTS[draft.outputMode]}
      >
        <select class="manage-input" value={draft.outputMode} onChange={update("outputMode")}>
          <option value="diff-panel">diff-panel — review side-by-side, accept/reject</option>
          <option value="replace">replace — overwrite block, no review</option>
          <option value="append-children">
            append-children — add as new children, one per line
          </option>
          <option value="outline-replace">
            outline-replace — replace existing children with a generated outline
          </option>
          <option value="outline-append">
            outline-append — append a generated outline alongside existing children
          </option>
          <option value="picker-replace">picker-replace — show N candidates, user picks one</option>
        </select>
      </Field>

      <div class={`manage-field${liveErrors.systemPrompt ? " error" : ""}`}>
        <span class="manage-field-label">System prompt</span>
        <div class={`manage-prompt-wrap${liveErrors.systemPrompt ? " error" : ""}`}>
          <textarea
            value={draft.systemPrompt}
            onInput={update("systemPrompt")}
            placeholder='Describe the task to the model. End with: "Return ONLY the transformed text — no preamble, no explanation, no surrounding quotes." …so small local models do not add noise to the output.'
            spellcheck={false}
          />
          <div class="manage-prompt-toolbar">
            <span>
              Lines: {promptLineCount} · Chars: {promptCharCount}
            </span>
            <span>{liveErrors.systemPrompt ? "required" : "tip: be specific and concrete"}</span>
          </div>
        </div>
        {liveErrors.systemPrompt ? (
          <span class="manage-field-error">{liveErrors.systemPrompt}</span>
        ) : null}
      </div>

      <div class="manage-run-row">
        <button type="button" class="diff-btn diff-btn-primary" onClick={onSave}>
          {mode === "create" ? "Add action" : "Save action"}
        </button>
        <button type="button" class="diff-btn" onClick={onCancel}>
          Cancel
        </button>
        {onDelete ? (
          <button type="button" class="diff-btn diff-btn-danger" onClick={onDelete}>
            Delete
          </button>
        ) : null}
        <span class="manage-run-spacer">
          <kbd>⌘ ↵</kbd> save · <kbd>esc</kbd> cancel
        </span>
      </div>
    </section>
  );
};
