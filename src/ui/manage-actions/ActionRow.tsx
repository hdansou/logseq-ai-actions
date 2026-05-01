import type { FunctionComponent } from "preact";
import type { Action } from "../../action";
import { outputModeLabel } from "./types";

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
export const ActionRow: FunctionComponent<ActionRowProps> = ({
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
