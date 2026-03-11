"use client";

import { type ReactNode, type SVGProps, useEffect, useRef, useState } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

import { MasterColumnDefinition } from "./use-master-columns";

function SvgIcon({
  children,
  ...props
}: SVGProps<SVGSVGElement> & {
  children: ReactNode;
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
      {...props}
    >
      {children}
    </svg>
  );
}

function MoveUpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgIcon {...props}>
      <path d="m12 6-4 4" />
      <path d="m12 6 4 4" />
      <path d="M12 18V7" />
    </SvgIcon>
  );
}

function MoveDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgIcon {...props}>
      <path d="m12 18-4-4" />
      <path d="m12 18 4-4" />
      <path d="M12 6v11" />
    </SvgIcon>
  );
}

type MasterColumnsMenuProps<K extends string> = {
  orderedColumns: readonly MasterColumnDefinition<K>[];
  columnVisibility: Record<K, boolean>;
  onToggleColumn: (columnKey: K) => void;
  onMoveColumn: (columnKey: K, direction: -1 | 1) => void;
  onReset: () => void;
  helperText?: string;
  triggerLabel?: string;
  triggerVariant?: ButtonProps["variant"];
  triggerButtonClassName?: string;
};

export function MasterColumnsMenu<K extends string>({
  orderedColumns,
  columnVisibility,
  onToggleColumn,
  onMoveColumn,
  onReset,
  helperText = "Toggle and reorder the visible columns for this list.",
  triggerLabel = "Columns",
  triggerVariant = "ghost",
  triggerButtonClassName,
}: MasterColumnsMenuProps<K>) {
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

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant={triggerVariant}
        className={cn(
          triggerVariant === "ghost"
            ? "ims-control-sm rounded-full border-0 bg-transparent px-2 shadow-none hover:bg-transparent"
            : "w-full justify-between rounded-xl px-3 shadow-none text-xs sm:text-sm",
          triggerVariant === "ghost"
            ? open
              ? "text-[var(--brand-primary-hover)]"
              : "text-[var(--text-strong)] hover:text-[var(--brand-primary-hover)]"
            : open
              ? "border-[var(--brand-primary)] text-[var(--brand-primary-hover)]"
              : "",
          triggerButtonClassName,
        )}
        aria-expanded={open}
        aria-label="Configure visible columns"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{triggerLabel}</span>
        {triggerVariant === "ghost" ? null : (
          <svg
            aria-hidden="true"
            viewBox="0 0 12 12"
            className="ml-2 h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M3 4.5L6 7.5L9 4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </Button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.35rem)] z-20 w-[min(17.5rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-2.5 shadow-[var(--shadow-md)] sm:p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[var(--text-strong)] sm:text-sm">
              Visible Columns
            </p>
            <Button variant="ghost" className="h-6 px-2 text-[11px] sm:h-7 sm:text-xs" onClick={onReset}>
              Reset
            </Button>
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            {orderedColumns.map((column, index) => (
              <div
                key={column.key}
                className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-soft)] px-2 py-1.5"
              >
                <label className="flex min-w-0 items-center gap-2 text-xs text-[var(--text-strong)] sm:text-sm">
                  <input
                    type="checkbox"
                    checked={columnVisibility[column.key]}
                    onChange={() => onToggleColumn(column.key)}
                  />
                  {column.label}
                </label>
                <div className="flex items-center gap-1">
                  <Button
                    variant="secondary"
                    className="h-6 w-6 rounded-md p-0 sm:h-7 sm:w-7"
                    disabled={index === 0}
                    aria-label={`Move ${column.label} earlier`}
                    onClick={() => onMoveColumn(column.key, -1)}
                  >
                    <MoveUpIcon className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-6 w-6 rounded-md p-0 sm:h-7 sm:w-7"
                    disabled={index === orderedColumns.length - 1}
                    aria-label={`Move ${column.label} later`}
                    onClick={() => onMoveColumn(column.key, 1)}
                  >
                    <MoveDownIcon className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-2 text-[11px] text-[var(--text-muted)] sm:text-xs">{helperText}</p>
        </div>
      ) : null}
    </div>
  );
}
