import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type RowActionItem = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  tone?: "default" | "danger";
};

export function RowActionMenu({
  items,
  label = "Manage",
}: {
  items: RowActionItem[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        !(target instanceof Node) ||
        (!menuRef.current?.contains(target) &&
          !triggerRef.current?.contains(target) &&
          !popoverRef.current?.contains(target))
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      return;
    }

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const width = 164;
      const margin = 12;
      const estimatedHeight = Math.max(items.length * 34 + 10, 86);
      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const top = spaceBelow >= estimatedHeight
        ? rect.bottom + 8
        : Math.max(margin, rect.top - estimatedHeight - 8);
      const preferredLeft = rect.left;
      const left = Math.min(
        Math.max(margin, preferredLeft),
        window.innerWidth - width - margin,
      );

      setMenuStyle({ top, left, width });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, items.length]);

  return (
    <div ref={menuRef} className="row-action-menu">
      <button
        ref={triggerRef}
        type="button"
        className="button button-secondary button-compact row-action-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        {label}
      </button>
      {open && menuStyle
        ? createPortal(
            <div
              ref={popoverRef}
              className="row-action-popover row-action-popover-portal"
              style={{
                position: "fixed",
                top: `${menuStyle.top}px`,
                left: `${menuStyle.left}px`,
                width: `${menuStyle.width}px`,
              }}
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={`row-action-item${item.tone === "danger" ? " row-action-item-danger" : ""}${item.disabled ? " row-action-item-disabled" : ""}`}
                  disabled={item.disabled}
                  title={item.title}
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                >
                  <span className="row-action-item-label">{item.label}</span>
                  {item.disabled ? (
                    <span className="row-action-item-meta">
                      {item.title ?? "Not available"}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
