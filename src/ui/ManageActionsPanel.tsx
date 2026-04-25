import type { ComponentChildren, FunctionComponent } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { type Action, ActionSchema } from "../action";
import { parseUserActions } from "../registry";

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
  kind: string;
  systemPrompt: string;
}

const BLANK_DRAFT: DraftAction = {
  id: "",
  title: "",
  description: "",
  scope: "block",
  outputMode: "diff-panel",
  kind: "text",
  systemPrompt: "",
};

function draftFrom(a: Action): DraftAction {
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    scope: a.scope,
    outputMode: a.outputMode,
    kind: a.kind,
    systemPrompt: a.systemPrompt,
  };
}

/** Build a kebab-case id suggestion from a free-text title. */
function suggestIdFromTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Inline hints rendered under the scope / output-mode / kind fields. The
 * hint text refreshes whenever the user changes the selection so they
 * read the description of the *current* choice — no dropdown spelunking.
 */
const SCOPE_HINTS: Readonly<Record<string, string>> = {
  selection:
    "Highlighted text within the block. v1 falls back to block scope (selection-range support is deferred — see REQUIREMENTS §14).",
  block: "Text of the block under the cursor only. Most rewrites use this.",
  subtree:
    "The block plus all its descendants, flattened into a Markdown outline. Used for summarising or outlining accumulated content.",
};

const OUTPUT_MODE_HINTS: Readonly<Record<string, string>> = {
  replace: "Overwrites the block's text with the model's response. No review step.",
  "diff-panel":
    "Side-by-side Original vs Proposed; Accept / Reject / switch to Edit mode before applying. Best for substantive changes.",
  "append-children":
    "Appends the model's response as new child blocks (one line per child). Non-destructive — the parent block and existing children are untouched.",
  "outline-replace":
    "Parses the response as a nested outline (with markdown-table support); deletes the block's existing direct children, then inserts the parsed tree. Destructive — confirm panel warns first.",
  "outline-append":
    "Same parser as outline-replace, but appends without deleting. Non-destructive — pre-existing children are preserved. Used by the OCR action.",
  "picker-replace":
    "Treats the response as N candidates (one per line); user picks one in a panel; replaces the block's text with the chosen value.",
};

const KIND_HINTS: Readonly<Record<string, string>> = {
  text: "Sends the block's resolved text (per scope) to the model. Almost every action uses this.",
  vision:
    "Sends an image asset's bytes — only valid on Asset-tagged blocks with a raster image type (png/jpg/jpeg/gif/webp). Requires a vision-capable model (qwen3.5, qwen2.5-vl, llava). Uses the Vision model setting (falls back to Model when empty).",
};

/**
 * Display-sort actions alphabetically by title (case-insensitive). The
 * underlying storage order in `userActionsJson` isn't touched — this is
 * a render-time pass so the UI stays scannable when the seed set + user
 * additions grow past a dozen entries.
 */
function sortByTitle<T extends { title: string }>(actions: readonly T[]): T[] {
  return [...actions].sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
}

/** Filter built-ins + user actions by a search query (matches title, id, prompt). */
function filterByQuery<T extends Action>(actions: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [...actions];
  return actions.filter(
    (a) =>
      a.title.toLowerCase().includes(q) ||
      a.id.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.systemPrompt.toLowerCase().includes(q),
  );
}

type View =
  | { kind: "gallery" }
  | { kind: "view-builtin"; actionId: string }
  | { kind: "edit"; index: number }
  | { kind: "create" }
  | { kind: "import" };

export const ManageActionsPanel: FunctionComponent<ManageActionsPanelProps> = ({
  builtin,
  initialUserActions,
  onSave,
  onClose,
}) => {
  const [userActions, setUserActions] = useState<Action[]>([...initialUserActions]);
  const [view, setView] = useState<View>({ kind: "gallery" });
  const [draft, setDraft] = useState<DraftAction>(BLANK_DRAFT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState<string>("");
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  const builtinIds = useMemo(() => new Set(builtin.map((b) => b.id)), [builtin]);
  const userIds = useMemo(() => new Set(userActions.map((u) => u.id)), [userActions]);

  const dirty = useMemo(
    () => JSON.stringify(userActions) !== JSON.stringify(initialUserActions),
    [userActions, initialUserActions],
  );

  const tryClose = () => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onClose();
  };

  // Esc closes (only at the gallery level — detail/import/delete handle their own keys).
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && view.kind === "gallery" && deleteIndex === null) {
        e.preventDefault();
        tryClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, dirty, deleteIndex]);

  const filteredBuiltin = useMemo(() => filterByQuery(builtin, query), [builtin, query]);
  const filteredUser = useMemo(() => filterByQuery(userActions, query), [userActions, query]);

  const openCreate = () => {
    setDraft(BLANK_DRAFT);
    setErrors({});
    setView({ kind: "create" });
  };

  const openEdit = (index: number) => {
    const a = userActions[index];
    if (!a) return;
    setDraft(draftFrom(a));
    setErrors({});
    setView({ kind: "edit", index });
  };

  const openViewBuiltin = (id: string) => {
    setView({ kind: "view-builtin", actionId: id });
  };

  const duplicateBuiltin = (id: string) => {
    const b = builtin.find((x) => x.id === id);
    if (!b) return;
    let newId = `${b.id}-copy`;
    let n = 2;
    while (userIds.has(newId) || builtinIds.has(newId)) {
      newId = `${b.id}-copy-${n}`;
      n += 1;
    }
    const next = draftFrom({ ...b, id: newId, title: `${b.title} (copy)` });
    setDraft(next);
    setErrors({});
    setView({ kind: "create" });
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
    if (d.id) {
      if (userActions.some((a, i) => a.id === d.id && i !== exceptIndex)) {
        errs.id = "Another user action already uses this id.";
      } else if (builtinIds.has(d.id) && exceptIndex === null) {
        // Allow shadowing on intent, but warn when it's almost certainly a mistake.
        errs.id = `Id "${d.id}" matches a built-in. Pick a different id, or proceed to shadow it (clear this warning by picking a unique id).`;
      }
    }
    return errs;
  };

  const liveErrors = useMemo(() => {
    if (view.kind !== "edit" && view.kind !== "create") return {};
    const exceptIndex = view.kind === "edit" ? view.index : null;
    return validateDraft(draft, exceptIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, view, userActions]);

  const errorCount = Object.keys(liveErrors).length;

  const saveEditor = () => {
    if (view.kind !== "edit" && view.kind !== "create") return;
    const exceptIndex = view.kind === "edit" ? view.index : null;
    const errs = validateDraft(draft, exceptIndex);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    const parsed = ActionSchema.parse(draft); // safe — validateDraft just passed
    const next = [...userActions];
    if (view.kind === "create") next.push(parsed);
    else next[view.index] = parsed;
    setUserActions(next);
    setView({ kind: "gallery" });
    setStatus(view.kind === "create" ? `Added "${parsed.title}"` : `Updated "${parsed.title}"`);
  };

  const requestDelete = (index: number) => {
    setDeleteIndex(index);
  };

  const confirmDelete = () => {
    if (deleteIndex === null) return;
    const target = userActions[deleteIndex];
    setUserActions(userActions.filter((_, i) => i !== deleteIndex));
    setDeleteIndex(null);
    if (target) setStatus(`Removed "${target.title}"`);
  };

  const cancelDelete = () => {
    setDeleteIndex(null);
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

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(userActions, null, 2));
      setStatus(
        `Copied ${userActions.length} action${userActions.length === 1 ? "" : "s"} to clipboard`,
      );
    } catch (err) {
      setStatus(`Copy failed: ${(err as Error).message}`);
    }
  };

  const applyImport = (raw: string): void => {
    const { userActions: parsed, errors: parseErrors } = parseUserActions(raw);
    if (parseErrors.length > 0 && parsed.length === 0) {
      setStatus(`Import failed: ${parseErrors[0] ?? "unknown parse error"}`);
      return;
    }
    const existingIds = new Set(userActions.map((a) => a.id));
    const incoming: Action[] = [];
    let skipped = 0;
    for (const a of parsed) {
      if (existingIds.has(a.id)) {
        skipped += 1;
        continue;
      }
      existingIds.add(a.id);
      incoming.push(a);
    }
    setUserActions([...userActions, ...incoming]);
    const pieces = [`imported ${incoming.length}`];
    if (skipped > 0) pieces.push(`${skipped} skipped (id already exists)`);
    if (parseErrors.length > 0) pieces.push(`${parseErrors.length} invalid`);
    setStatus(pieces.join(" · "));
    setView({ kind: "gallery" });
  };

  // ─── View rendering ───
  if (view.kind === "edit" || view.kind === "create") {
    return (
      <ManageRoot label={view.kind === "create" ? "New action" : "Edit action"}>
        <DetailEditor
          mode={view.kind}
          draft={draft}
          setDraft={setDraft}
          errors={errors}
          liveErrors={liveErrors}
          errorCount={errorCount}
          onCancel={() => setView({ kind: "gallery" })}
          onSave={saveEditor}
          {...(view.kind === "edit" ? { onDelete: () => requestDelete(view.index) } : {})}
        />
        {deleteIndex !== null ? (
          <DeleteOverlay
            actionTitle={userActions[deleteIndex]?.title || userActions[deleteIndex]?.id || ""}
            onCancel={cancelDelete}
            onConfirm={() => {
              confirmDelete();
              setView({ kind: "gallery" });
            }}
          />
        ) : null}
      </ManageRoot>
    );
  }

  if (view.kind === "view-builtin") {
    const target = builtin.find((b) => b.id === view.actionId);
    if (!target) {
      setView({ kind: "gallery" });
      return null;
    }
    return (
      <ManageRoot label={`View ${target.title}`}>
        <DetailReadonly
          action={target}
          onBack={() => setView({ kind: "gallery" })}
          onDuplicate={() => duplicateBuiltin(target.id)}
        />
      </ManageRoot>
    );
  }

  if (view.kind === "import") {
    return (
      <ManageRoot label="Import actions JSON">
        <ImportView onCancel={() => setView({ kind: "gallery" })} onImport={applyImport} />
      </ManageRoot>
    );
  }

  // gallery
  const showEmptyState = userActions.length === 0 && query.trim().length === 0;

  return (
    <ManageRoot
      label="AI actions"
      headerExtra={
        <OverflowMenu
          items={[
            {
              label: "Copy all",
              onClick: () => void copyAll(),
              disabled: userActions.length === 0,
              title: "Copy the current user-actions list to clipboard as JSON",
            },
          ]}
        />
      }
    >
      <div class="manage-toolbar">
        <div class="manage-search">
          <input
            type="text"
            placeholder="Search actions"
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            aria-label="Search actions"
          />
        </div>
        <button type="button" class="diff-btn" onClick={openCreate}>
          New
        </button>
        <button type="button" class="diff-btn" onClick={() => setView({ kind: "import" })}>
          Import
        </button>
      </div>

      <div class="manage-body">
        {filteredBuiltin.length > 0 ? (
          <>
            <div class="manage-section-header">
              <span class="manage-section-label">Built-in</span>
            </div>
            <div class="manage-row-list">
              {sortByTitle(filteredBuiltin).map((a) => {
                const shadowed = userActions.some((u) => u.id === a.id);
                return (
                  <ActionRow
                    key={a.id}
                    action={a}
                    shadowed={shadowed}
                    onClick={() => openViewBuiltin(a.id)}
                  />
                );
              })}
            </div>
          </>
        ) : null}

        <div class="manage-section-header">
          <span class="manage-section-label">Your actions</span>
        </div>
        {showEmptyState ? (
          <p class="manage-empty-line">
            No custom actions yet. Add your own to capture workflows you'd type into a chatbot more
            than once.
          </p>
        ) : filteredUser.length === 0 && query.trim().length > 0 ? (
          <p class="manage-row-empty-search">No user actions match "{query}".</p>
        ) : (
          <div class="manage-row-list">
            {sortByTitle(filteredUser).map((a) => {
              // The displayed list is sorted, but edit/delete still need to
              // target the original position in `userActions` so the JSON
              // round-trips correctly. Look up the true index here.
              const trueIndex = userActions.indexOf(a);
              return (
                <ActionRow
                  key={`u-${a.id}-${trueIndex}`}
                  action={a}
                  shadowsBuiltin={builtinIds.has(a.id)}
                  onClick={() => openEdit(trueIndex)}
                />
              );
            })}
          </div>
        )}
      </div>

      <footer class="diff-footer">
        <span class="manage-footer-status">
          {status ??
            `${userActions.length} user action${userActions.length === 1 ? "" : "s"} · synced with userActionsJson`}
        </span>
        <button type="button" class="manage-create-btn" onClick={openCreate}>
          + Create
        </button>
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

      {deleteIndex !== null ? (
        <DeleteOverlay
          actionTitle={userActions[deleteIndex]?.title || userActions[deleteIndex]?.id || ""}
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      ) : null}
    </ManageRoot>
  );
};

// ─── Sub-components ────────────────────────────────────────────────────

const ManageRoot: FunctionComponent<{
  label: string;
  /** Optional element rendered in the header just before the "Esc close" hint
   * (used for the "..." overflow menu in the gallery view). */
  headerExtra?: ComponentChildren;
  children: ComponentChildren;
}> = ({ label, headerExtra, children }) => (
  <div class="diff-root" role="dialog" aria-label={label}>
    <div class="diff-modal manage-modal">
      <header class="diff-header">
        <strong>{label}</strong>
        <span class="diff-hint" style="display:inline-flex;align-items:center;gap:8px;">
          {headerExtra}
          <span>
            <kbd>Esc</kbd> close
          </span>
        </span>
      </header>
      {children}
    </div>
  </div>
);

interface ActionRowProps {
  readonly action: Action;
  /** True when this is a built-in that has been shadowed by a user action. */
  readonly shadowed?: boolean;
  /** True when this is a user action whose id matches a built-in (it shadows one). */
  readonly shadowsBuiltin?: boolean;
  readonly onClick: () => void;
}

/**
 * One row in the action gallery. Title + tags inline, optional description
 * underneath in muted text, divider below. Click opens detail (read-only
 * inspect for built-ins, editor for user actions).
 *
 * Renders as a real `<button>` — there are no nested interactive elements
 * (the per-row edit/delete icons from the previous design are gone), so
 * full keyboard semantics fall out for free.
 */
const ActionRow: FunctionComponent<ActionRowProps> = ({
  action,
  shadowed,
  shadowsBuiltin,
  onClick,
}) => {
  const isVision = action.kind === "vision";
  const cls = `manage-row${shadowed ? " manage-row-shadowed" : ""}`;
  return (
    <button type="button" class={cls} onClick={onClick} aria-label={`Open ${action.title}`}>
      <div class="manage-row-header">
        <span class="manage-row-title">{action.title}</span>
        <span class="manage-row-tags">
          {isVision ? <span class="manage-tag-vision">vision</span> : null}
          {isVision ? <span class="sep">·</span> : null}
          <span>{action.scope}</span>
          <span class="sep">·</span>
          <span>{outputModeLabel(action.outputMode)}</span>
          {shadowed ? (
            <>
              <span class="sep">·</span>
              <span class="manage-tag-shadow">shadowed</span>
            </>
          ) : null}
          {shadowsBuiltin ? (
            <>
              <span class="sep">·</span>
              <span class="manage-tag-shadow">shadows built-in</span>
            </>
          ) : null}
        </span>
      </div>
      {action.description ? <p class="manage-row-desc">{action.description}</p> : null}
    </button>
  );
};

interface OverflowMenuItem {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly title?: string;
}
interface OverflowMenuProps {
  readonly items: ReadonlyArray<OverflowMenuItem>;
}
/**
 * The "..." menu in the modal header. Holds global actions that don't
 * earn a toolbar slot (currently just Copy all). Click outside / Esc
 * closes it; selecting an item closes too.
 */
const OverflowMenu: FunctionComponent<OverflowMenuProps> = ({ items }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div class="manage-overflow-wrap" ref={wrapRef}>
      <button
        type="button"
        class="manage-overflow-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⋯
      </button>
      {open ? (
        <div class="manage-overflow-menu" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              class="manage-overflow-item"
              role="menuitem"
              disabled={item.disabled}
              title={item.title}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

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
const DetailEditor: FunctionComponent<DetailEditorProps> = ({
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

interface DetailReadonlyProps {
  readonly action: Action;
  readonly onBack: () => void;
  readonly onDuplicate: () => void;
}
const DetailReadonly: FunctionComponent<DetailReadonlyProps> = ({
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

interface DeleteOverlayProps {
  readonly actionTitle: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}
const DeleteOverlay: FunctionComponent<DeleteOverlayProps> = ({
  actionTitle,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onConfirm, onCancel]);

  return (
    <div class="manage-confirm-overlay" role="alertdialog" aria-label="Confirm delete">
      <div class="manage-confirm-card">
        <h3>Delete "{actionTitle}"?</h3>
        <p>
          This removes the action from your list. The slash command, palette entry, and context-menu
          item stay registered until you reload the plugin (Logseq has no deregister API). Invoking
          a removed action shows a "no longer available" toast.
        </p>
        <div class="manage-confirm-actions">
          <button type="button" class="diff-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" class="diff-btn diff-btn-danger" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

interface ImportViewProps {
  readonly onCancel: () => void;
  readonly onImport: (rawJson: string) => void;
}
const ImportView: FunctionComponent<ImportViewProps> = ({ onCancel, onImport }) => {
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

interface PillRadioProps {
  readonly name: string;
  readonly value: string;
  readonly options: ReadonlyArray<{ value: string; label: string }>;
  readonly onChange?: (v: string) => void;
  readonly disabled?: boolean;
}
const PillRadio: FunctionComponent<PillRadioProps> = ({
  name,
  value,
  options,
  onChange,
  disabled,
}) => (
  <div class="manage-radio-group" role="radiogroup" aria-label={name}>
    {options.map((opt) => {
      const checked = opt.value === value;
      const cls = `manage-radio${checked ? " checked" : ""}${disabled ? " disabled" : ""}`;
      return (
        <label key={opt.value} class={cls}>
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={checked}
            disabled={disabled}
            onChange={() => {
              if (!disabled && onChange) onChange(opt.value);
            }}
            // Visually hidden — the parent <label> carries the pill style.
            style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0"
          />
          {checked ? "●" : "○"} {opt.label}
        </label>
      );
    })}
  </div>
);

const Field: FunctionComponent<{
  label: string;
  error?: string | undefined;
  /**
   * Optional inline hint rendered under the input. Used for scope /
   * output-mode / kind so the user gets a description of the *currently
   * selected* value without leaving the form.
   */
  hint?: string | undefined;
  children: ComponentChildren;
}> = ({ label, error, hint, children }) => (
  <div class={`manage-field${error ? " error" : ""}`}>
    <span class="manage-field-label">{label}</span>
    {children}
    {hint ? <span class="manage-field-hint">{hint}</span> : null}
    {error ? <span class="manage-field-error">{error}</span> : null}
  </div>
);

/** Friendly short label for an output mode (used in card meta tags). */
function outputModeLabel(mode: string): string {
  switch (mode) {
    case "diff-panel":
      return "diff";
    case "append-children":
      return "append";
    case "outline-replace":
      return "outline-rep";
    case "outline-append":
      return "outline-app";
    case "picker-replace":
      return "pick";
    default:
      return mode;
  }
}
