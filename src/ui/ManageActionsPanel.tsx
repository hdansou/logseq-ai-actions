import type { ComponentChildren, FunctionComponent } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { type Action, ActionSchema } from "../action";

export interface ManageActionsPanelProps {
  readonly builtin: readonly Action[];
  readonly initialUserActions: readonly Action[];
  /** Persist the new user-actions list. Expected to update the plugin settings. */
  readonly onSave: (userActions: readonly Action[]) => Promise<void>;
  readonly onClose: () => void;
}

/** Draft shape used by the editor form — all string-typed so half-filled forms don't fight the schema. */
interface DraftAction {
  id: string;
  title: string;
  description: string;
  scope: string;
  outputMode: string;
  systemPrompt: string;
}

const BLANK_DRAFT: DraftAction = {
  id: "",
  title: "",
  description: "",
  scope: "block",
  outputMode: "replace",
  systemPrompt: "",
};

function draftFrom(a: Action): DraftAction {
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    scope: a.scope,
    outputMode: a.outputMode,
    systemPrompt: a.systemPrompt,
  };
}

export const ManageActionsPanel: FunctionComponent<ManageActionsPanelProps> = ({
  builtin,
  initialUserActions,
  onSave,
  onClose,
}) => {
  const [userActions, setUserActions] = useState<Action[]>([...initialUserActions]);
  const [view, setView] = useState<"list" | "edit">("list");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftAction>(BLANK_DRAFT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);

  const builtinIds = useMemo(() => new Set(builtin.map((b) => b.id)), [builtin]);

  const dirty = useMemo(
    () => JSON.stringify(userActions) !== JSON.stringify(initialUserActions),
    [userActions, initialUserActions],
  );

  const tryClose = () => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onClose();
  };

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && view === "list") {
        e.preventDefault();
        tryClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, dirty]);

  const openEditor = (index: number | null) => {
    if (index === null) {
      setDraft(BLANK_DRAFT);
    } else {
      const a = userActions[index];
      if (!a) return;
      setDraft(draftFrom(a));
    }
    setEditingIndex(index);
    setErrors({});
    setView("edit");
  };

  const validateDraft = (d: DraftAction, exceptIndex: number | null): Record<string, string> => {
    const errs: Record<string, string> = {};
    const parsed = ActionSchema.safeParse(d);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "");
        if (field && !errs[field]) errs[field] = issue.message;
      }
    }
    if (d.id && userActions.some((a, i) => a.id === d.id && i !== exceptIndex)) {
      errs.id = "Another user action already uses this id.";
    }
    return errs;
  };

  const saveEditor = () => {
    const errs = validateDraft(draft, editingIndex);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    const parsed = ActionSchema.parse(draft); // safe — validateDraft just passed
    const next = [...userActions];
    if (editingIndex === null) next.push(parsed);
    else next[editingIndex] = parsed;
    setUserActions(next);
    setView("list");
  };

  const deleteEditing = () => {
    if (editingIndex === null) {
      setView("list");
      return;
    }
    if (!window.confirm(`Delete "${draft.title || draft.id}"?`)) return;
    setUserActions(userActions.filter((_, i) => i !== editingIndex));
    setView("list");
  };

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= userActions.length) return;
    const next = [...userActions];
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    setUserActions(next);
  };

  const saveChanges = async () => {
    setStatus("Saving…");
    try {
      await onSave(userActions);
      setStatus("Saved");
      setTimeout(() => onClose(), 400);
    } catch (err) {
      setStatus(`Save failed: ${(err as Error).message}`);
    }
  };

  if (view === "edit") {
    const editorProps: EditorViewProps = {
      draft,
      setDraft,
      errors,
      isNew: editingIndex === null,
      onCancel: () => setView("list"),
      onSave: saveEditor,
      ...(editingIndex !== null ? { onDelete: deleteEditing } : {}),
    };
    return <EditorView {...editorProps} />;
  }

  return (
    <div class="diff-root" role="dialog" aria-label="Manage AI Actions">
      <div class="diff-modal manage-modal">
        <header class="diff-header">
          <strong>Manage AI Actions</strong>
          <span class="diff-hint">
            {userActions.length} user action{userActions.length === 1 ? "" : "s"} · {builtin.length}{" "}
            built-in
          </span>
        </header>

        <section class="manage-list">
          {builtin.map((a) => {
            const shadowed = userActions.some((u) => u.id === a.id);
            return <ActionCard key={a.id} action={a} kind="builtin" shadowed={shadowed} />;
          })}

          {userActions.length > 0 ? <hr class="manage-divider" /> : null}

          {userActions.map((a, i) => {
            const onDelete = () => {
              if (!window.confirm(`Delete "${a.title || a.id}"?`)) return;
              setUserActions(userActions.filter((_, idx) => idx !== i));
            };
            const cardProps: ActionCardProps = {
              action: a,
              kind: "user",
              shadowsBuiltin: builtinIds.has(a.id),
              onEdit: () => openEditor(i),
              onDelete,
              ...(i > 0 ? { onMoveUp: () => move(i, -1) } : {}),
              ...(i < userActions.length - 1 ? { onMoveDown: () => move(i, 1) } : {}),
            };
            return <ActionCard key={`u-${a.id}-${i}`} {...cardProps} />;
          })}

          <button type="button" class="diff-btn manage-new-btn" onClick={() => openEditor(null)}>
            + New action
          </button>
        </section>

        <div class="manage-warning">
          Adding or removing actions takes effect after a plugin reload (Logseq has no deregister
          API for slash/palette entries). Editing an existing action's prompt or title updates on
          its next invocation.
        </div>

        <footer class="diff-footer">
          {status ? <span class="diag-status">{status}</span> : null}
          <button type="button" class="diff-btn" onClick={tryClose}>
            {dirty ? "Discard" : "Close"}
          </button>
          <button
            type="button"
            class="diff-btn diff-btn-primary"
            onClick={() => void saveChanges()}
            disabled={!dirty}
          >
            Save changes
          </button>
        </footer>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────

interface ActionCardProps {
  readonly action: Action;
  readonly kind: "builtin" | "user";
  /** (kind=builtin) whether a user action has shadowed this built-in. */
  readonly shadowed?: boolean;
  /** (kind=user) whether this user action's id matches a built-in. */
  readonly shadowsBuiltin?: boolean;
  readonly onEdit?: () => void;
  readonly onDelete?: () => void;
  readonly onMoveUp?: () => void;
  readonly onMoveDown?: () => void;
}

const ActionCard: FunctionComponent<ActionCardProps> = ({
  action,
  kind,
  shadowed,
  shadowsBuiltin,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}) => (
  <article class={`manage-card manage-card-${kind}${shadowed ? " manage-card-shadowed" : ""}`}>
    <header class="manage-card-header">
      <strong class="manage-card-title">{action.title}</strong>
      <span class="manage-card-meta">
        {kind === "builtin" ? (
          <span class="manage-badge manage-badge-builtin">built-in</span>
        ) : null}
        {shadowsBuiltin ? (
          <span class="manage-badge manage-badge-shadow">shadows built-in</span>
        ) : null}
        {shadowed ? <span class="manage-badge manage-badge-shadow">shadowed by user</span> : null}
        <span class="manage-meta-pill">
          {action.scope} · {action.outputMode}
        </span>
      </span>
    </header>
    {action.description ? <p class="manage-card-desc">{action.description}</p> : null}
    {kind === "user" ? (
      <div class="manage-card-actions">
        <button
          type="button"
          class="manage-row-btn"
          onClick={onMoveUp}
          disabled={!onMoveUp}
          aria-label="Move up"
          title="Move up"
        >
          ↑
        </button>
        <button
          type="button"
          class="manage-row-btn"
          onClick={onMoveDown}
          disabled={!onMoveDown}
          aria-label="Move down"
          title="Move down"
        >
          ↓
        </button>
        <button type="button" class="diff-btn" onClick={onEdit}>
          Edit
        </button>
        <button type="button" class="diff-btn" onClick={onDelete}>
          Delete
        </button>
      </div>
    ) : null}
  </article>
);

// ───────────────────────────────────────────────────────────────────────

interface EditorViewProps {
  readonly draft: DraftAction;
  readonly setDraft: (d: DraftAction) => void;
  readonly errors: Record<string, string>;
  readonly isNew: boolean;
  readonly onCancel: () => void;
  readonly onSave: () => void;
  readonly onDelete?: () => void;
}

const EditorView: FunctionComponent<EditorViewProps> = ({
  draft,
  setDraft,
  errors,
  isNew,
  onCancel,
  onSave,
  onDelete,
}) => {
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
    setDraft({ ...draft, [key]: value });
  };

  return (
    <div class="diff-root" role="dialog" aria-label={isNew ? "New action" : "Edit action"}>
      <div class="diff-modal manage-modal">
        <header class="diff-header">
          <span class="diff-header-main">
            <button
              type="button"
              class="manage-back-btn"
              onClick={onCancel}
              aria-label="Back to list"
              title="Back"
            >
              ←
            </button>
            <strong>{isNew ? "New action" : `Edit ${draft.title || "action"}`}</strong>
          </span>
          <span class="diff-hint">
            <kbd>Esc</kbd> cancel · <kbd>⌘ ↵</kbd> save
          </span>
        </header>

        <section class="manage-form">
          <Field label="ID (unique; used in the slash command)" error={errors.id}>
            <input
              type="text"
              class="manage-input"
              value={draft.id}
              onInput={update("id")}
              placeholder="action-items"
              autocomplete="off"
              spellcheck={false}
            />
          </Field>
          <Field label="Title (shown in menus)" error={errors.title}>
            <input
              type="text"
              class="manage-input"
              value={draft.title}
              onInput={update("title")}
              placeholder="Action Items"
            />
          </Field>
          <Field label="Description (optional)" error={errors.description}>
            <input
              type="text"
              class="manage-input"
              value={draft.description}
              onInput={update("description")}
              placeholder="Extract TODO items from meeting notes."
            />
          </Field>
          <div class="manage-field-row">
            <Field label="Scope" error={errors.scope}>
              <select class="manage-input" value={draft.scope} onChange={update("scope")}>
                <option value="block">block (current block)</option>
                <option value="subtree">subtree (block + children)</option>
                <option value="selection">selection — falls back to block in v1</option>
              </select>
            </Field>
            <Field label="Output mode" error={errors.outputMode}>
              <select class="manage-input" value={draft.outputMode} onChange={update("outputMode")}>
                <option value="replace">replace (overwrite block)</option>
                <option value="diff-panel">diff-panel (review before apply)</option>
                <option value="append-children">append-children (new child blocks)</option>
              </select>
            </Field>
          </div>
          <Field label="System prompt" error={errors.systemPrompt}>
            <textarea
              class="manage-input manage-textarea"
              rows={9}
              value={draft.systemPrompt}
              onInput={update("systemPrompt")}
              placeholder="Describe what the model should do. For small local models, end with 'Return ONLY the transformed text — no preamble, no explanation, no surrounding quotes.'"
            />
          </Field>
        </section>

        <footer class="diff-footer">
          <button type="button" class="diff-btn" onClick={onCancel}>
            Cancel
          </button>
          {onDelete ? (
            <button type="button" class="diff-btn" onClick={onDelete}>
              Delete
            </button>
          ) : null}
          <button type="button" class="diff-btn diff-btn-primary" onClick={onSave}>
            Save action
          </button>
        </footer>
      </div>
    </div>
  );
};

const Field: FunctionComponent<{
  label: string;
  error?: string | undefined;
  children: ComponentChildren;
}> = ({ label, error, children }) => (
  // Plain div rather than <label>: input controls are deep inside the
  // `children` slot (often wrapped by Preact's own rendering), and Biome's
  // a11y check fights the implicit-association pattern. Visual-only
  // grouping, no accessibility regression for a plugin-internal form.
  <div class="manage-field">
    <span class="manage-field-label">{label}</span>
    {children}
    {error ? <span class="manage-field-error">{error}</span> : null}
  </div>
);
