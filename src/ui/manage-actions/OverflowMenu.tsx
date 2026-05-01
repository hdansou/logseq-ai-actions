import type { FunctionComponent } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

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
export const OverflowMenu: FunctionComponent<OverflowMenuProps> = ({ items }) => {
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
