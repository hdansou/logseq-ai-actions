import type { FunctionComponent } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { type Action, ActionSchema } from "../../action";
import { parseUserActions } from "../../registry";
import { ConfirmOverlay } from "../ConfirmOverlay";
import { ActionRow } from "./ActionRow";
import { DetailEditor } from "./DetailEditor";
import { DetailReadonly } from "./DetailReadonly";
import { ImportView } from "./ImportView";
import { ManageRoot } from "./ManageRoot";
import { OverflowMenu } from "./OverflowMenu";
import {
  BLANK_DRAFT,
  type DraftAction,
  draftFrom,
  filterByQuery,
  sortByTitle,
  type View,
} from "./types";

export interface ManageActionsPanelProps {
  readonly builtin: readonly Action[];
  readonly initialUserActions: readonly Action[];
  /** Persist the new user-actions list. Expected to update the plugin settings. */
  readonly onSave: (userActions: readonly Action[]) => Promise<void>;
  readonly onClose: () => void;
}

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
  const [discardOpen, setDiscardOpen] = useState<boolean>(false);

  const builtinIds = useMemo(() => new Set(builtin.map((b) => b.id)), [builtin]);
  const userIds = useMemo(() => new Set(userActions.map((u) => u.id)), [userActions]);

  const dirty = useMemo(
    () => JSON.stringify(userActions) !== JSON.stringify(initialUserActions),
    [userActions, initialUserActions],
  );

  const tryClose = () => {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
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
          <ConfirmOverlay
            title={`Delete "${userActions[deleteIndex]?.title || userActions[deleteIndex]?.id || ""}"?`}
            message="This removes the action from your list. The slash command, palette entry, and context-menu item stay registered until you reload the plugin (Logseq has no deregister API). Invoking a removed action shows a 'no longer available' toast."
            confirmLabel="Delete"
            danger
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
            <div
              class="manage-row-list"
              style={`--row-count:${Math.max(1, Math.ceil(filteredBuiltin.length / 2))}`}
            >
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
          <div
            class="manage-row-list"
            style={`--row-count:${Math.max(1, Math.ceil(filteredUser.length / 2))}`}
          >
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
        <ConfirmOverlay
          title={`Delete "${userActions[deleteIndex]?.title || userActions[deleteIndex]?.id || ""}"?`}
          message="This removes the action from your list. The slash command, palette entry, and context-menu item stay registered until you reload the plugin (Logseq has no deregister API). Invoking a removed action shows a 'no longer available' toast."
          confirmLabel="Delete"
          danger
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      ) : null}

      {discardOpen ? (
        <ConfirmOverlay
          title="Discard unsaved changes?"
          message="You have unsaved changes to your custom actions. Closing now will lose them."
          confirmLabel="Discard"
          danger
          onCancel={() => setDiscardOpen(false)}
          onConfirm={() => {
            setDiscardOpen(false);
            onClose();
          }}
        />
      ) : null}
    </ManageRoot>
  );
};
