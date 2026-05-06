import type { FunctionComponent } from "preact";
import type { Action } from "../../action";
import { outputModeLabel } from "./types";

interface ActionRowProps {
  readonly action: Action;
  /** Where the action came from — drives the source pill on every row. */
  readonly source: "builtin" | "user";
  /** True when this is a built-in that has been shadowed by a user action. */
  readonly shadowed?: boolean;
  /** True when this is a user action whose id matches a built-in (it shadows one). */
  readonly shadowsBuiltin?: boolean;
  /** When set, the row carries a Hide button (visible on row hover) that calls this. */
  readonly onHide?: () => void;
  /** When set, the row carries an always-visible Restore button (used inside the Hidden bin). */
  readonly onRestore?: () => void;
  readonly onClick: () => void;
}

/**
 * One row in the action gallery. Title + tags inline, optional description
 * underneath in muted text, divider below.
 *
 * DOM shape: a `<div class="manage-row-cell">` wraps the click-to-open
 * `<button class="manage-row">` plus optional sibling `<button>` controls
 * for Hide / Restore. Real `<button>`s for everything — no nested
 * interactive elements. The Hide / Restore controls float over the
 * row's right edge via absolute positioning in CSS; Hide is hover-only,
 * Restore is always visible (used inside the Hidden bin).
 */
export const ActionRow: FunctionComponent<ActionRowProps> = ({
  action,
  source,
  shadowed,
  shadowsBuiltin,
  onHide,
  onRestore,
  onClick,
}) => {
  const isVision = action.kind === "vision";
  const cls = `manage-row${shadowed ? " manage-row-shadowed" : ""}`;
  return (
    <div class="manage-row-cell">
      <button type="button" class={cls} onClick={onClick} aria-label={`Open ${action.title}`}>
        <div class="manage-row-header">
          <span class="manage-row-title">{action.title}</span>
          <span class="manage-row-tags">
            <span
              class={
                source === "builtin"
                  ? "manage-tag-source"
                  : "manage-tag-source manage-tag-source-user"
              }
            >
              {source}
            </span>
            <span class="sep">·</span>
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
      {onHide ? (
        <button
          type="button"
          class="manage-row-pill-action manage-row-hide"
          onClick={onHide}
          aria-label={`Hide ${action.title}`}
        >
          Hide
        </button>
      ) : null}
      {onRestore ? (
        <button
          type="button"
          class="manage-row-pill-action manage-row-restore"
          onClick={onRestore}
          aria-label={`Restore ${action.title}`}
        >
          Restore
        </button>
      ) : null}
    </div>
  );
};
