"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

type TransactionRowAction = {
  label: string;
  onSelect: () => void | Promise<void>;
  disabled?: boolean;
  tone?: "default" | "danger";
};

export function TransactionRowActionsMenu({
  actions,
  className,
}: {
  actions: readonly TransactionRowAction[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (actions.length === 0) {
    return <span className="text-sm text-[var(--text-muted)]">--</span>;
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Button
        variant="secondary"
        className="h-9 w-9 rounded-full px-0 shadow-none"
        aria-label="Open row actions"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4.5 w-4.5"
          fill="currentColor"
        >
          <circle cx="12" cy="5" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="12" cy="19" r="1.7" />
        </svg>
      </Button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.35rem)] z-20 min-w-[10rem] rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[var(--shadow-md)]">
          <div className="space-y-1">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                disabled={action.disabled}
                className={cn(
                  "flex w-full items-center justify-start rounded-[var(--radius-sm)] px-3 py-2 text-sm transition",
                  action.tone === "danger"
                    ? "text-[var(--status-danger-fg)] hover:bg-[var(--surface-muted)]"
                    : "text-[var(--text-strong)] hover:bg-[var(--surface-muted)]",
                  action.disabled ? "cursor-not-allowed opacity-50" : "",
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  if (action.disabled) {
                    return;
                  }
                  setOpen(false);
                  void action.onSelect();
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
