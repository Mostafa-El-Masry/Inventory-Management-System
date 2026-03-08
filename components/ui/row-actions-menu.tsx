"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";

type RowActionItem = {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

type RowActionsMenuProps = {
  label: string;
  items: RowActionItem[];
  disabled?: boolean;
};

const MENU_WIDTH = 176;

export function RowActionsMenu({
  label,
  items,
  disabled = false,
}: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const enabledItems = items.filter((item) => !item.disabled);

  const updatePosition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const estimatedHeight = items.length * 40 + 12;
    const left = Math.min(
      window.innerWidth - MENU_WIDTH - 8,
      Math.max(8, rect.right - MENU_WIDTH),
    );
    const top =
      rect.bottom + estimatedHeight + 8 <= window.innerHeight
        ? rect.bottom + 6
        : Math.max(8, rect.top - estimatedHeight - 6);

    setPosition({
      top,
      left,
    });
  }, [items.length]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    updatePosition();

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    function handleViewportChange() {
      updatePosition();
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updatePosition]);

  if (enabledItems.length === 0) {
    return null;
  }

  return (
    <>
      <Button
        ref={buttonRef}
        variant="secondary"
        className="h-8 w-8 rounded-full p-0 text-sm leading-none"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        ...
      </Button>

      {mounted && open
        ? createPortal(
            <div
              id={menuId}
              ref={menuRef}
              role="menu"
              className="fixed z-[90] min-w-[11rem] rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-1 shadow-[var(--shadow-md)]"
              style={{
                top: position.top,
                left: position.left,
                width: `${MENU_WIDTH}px`,
              }}
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  className={[
                    "block w-full rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm transition",
                    item.destructive
                      ? "text-[var(--status-danger-fg)] hover:bg-[var(--status-danger-bg)]"
                      : "hover:bg-[var(--surface-muted)]",
                    item.disabled ? "cursor-not-allowed opacity-50" : "",
                  ].join(" ")}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
