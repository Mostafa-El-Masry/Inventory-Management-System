"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils/cn";

import { Button } from "./button";

type FilterPopoverProps = {
  children: ReactNode;
  onApply: () => void | Promise<void>;
  onClear?: () => void;
  label?: string;
  title?: string;
  applyLabel?: string;
  clearLabel?: string;
  applied?: boolean;
  disabled?: boolean;
  className?: string;
  panelClassName?: string;
};

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 7h16" />
      <path d="M7 12h10" />
      <path d="M10 17h4" />
    </svg>
  );
}

function ChevronIcon({
  className,
  open,
}: {
  className?: string;
  open: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("transition-transform duration-200", open ? "rotate-180" : "", className)}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function FilterPopover({
  children,
  onApply,
  onClear,
  label = "Filter",
  title = "Filters",
  applyLabel = "Apply",
  clearLabel = "Clear Filters",
  applied = false,
  disabled = false,
  className,
  panelClassName,
}: FilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  async function applyAndClose() {
    await onApply();
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "ims-control-lg rounded-full px-[var(--control-px)] text-[var(--control-font-size)] font-medium shadow-none",
          applied
            ? "bg-[var(--brand-primary-soft)] text-[var(--brand-primary-hover)]"
            : "bg-[var(--surface)]",
        )}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <FilterIcon className="h-4.5 w-4.5" />
        {label}
        <ChevronIcon className="h-4 w-4" open={open} />
      </Button>

      {open ? (
        <div
          className={cn(
            "absolute right-0 top-[calc(100%+0.65rem)] z-30 w-[min(100vw-1.5rem,48rem)] rounded-[var(--radius-xl)] border border-[var(--line)] bg-[var(--surface)] p-[var(--space-4)] shadow-[var(--shadow-lg)] sm:w-[min(100vw-2rem,48rem)] sm:rounded-[1.75rem] sm:p-[var(--space-5)]",
            panelClassName,
          )}
          role="dialog"
          aria-label={title}
        >
          <div className="mb-[var(--space-4)] flex items-center justify-between gap-3">
            <h3 className="text-[clamp(0.94rem,0.91rem+0.18vw,1.08rem)] font-semibold text-[var(--text-strong)]">
              {title}
            </h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex ims-icon-btn-md items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-soft)] text-[var(--text-muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text-strong)]"
              aria-label="Close filters"
            >
              x
            </button>
          </div>

          {children}

          <div className="mt-[var(--space-5)] flex flex-wrap justify-end gap-3">
            {onClear ? (
              <Button
                variant="outline"
                className="ims-control-lg min-w-[8.5rem] rounded-full sm:min-w-[10rem]"
                onClick={onClear}
              >
                {clearLabel}
              </Button>
            ) : null}
            <Button className="ims-control-lg min-w-[7rem] rounded-full sm:min-w-[8rem]" onClick={() => applyAndClose()}>
              {applyLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
