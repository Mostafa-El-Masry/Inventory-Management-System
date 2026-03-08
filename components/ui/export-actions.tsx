"use client";

import { useEffect, useRef, useState } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { runExport, runPrint } from "@/lib/export/client";
import type { ExportDataset, ExportFormat } from "@/lib/export/contracts";

type ExportActionsProps = ExportDataset & {
  buttonClassName?: string;
  className?: string;
  triggerLabel?: string;
  variant?: ButtonProps["variant"];
};

const ACTIONS: Array<{ format: ExportFormat; label: string }> = [
  { format: "print", label: "Print" },
  { format: "csv", label: "Export CSV" },
  { format: "xlsx", label: "Export Excel" },
  { format: "pdf", label: "Export PDF" },
];

function labelForLoading(format: ExportFormat | null) {
  if (!format) {
    return null;
  }

  if (format === "print") {
    return "Preparing print...";
  }

  if (format === "csv") {
    return "Exporting CSV...";
  }

  if (format === "xlsx") {
    return "Exporting Excel...";
  }

  return "Exporting PDF...";
}

export function ExportActions({
  buttonClassName,
  className,
  columns,
  emptyMessage,
  filenameBase,
  filterSummary,
  printOrientation,
  rows,
  title,
  triggerLabel = "Print / Export",
  variant = "outline",
}: ExportActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeFormat, setActiveFormat] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current) {
        return;
      }

      if (!rootRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  async function handleAction(format: ExportFormat) {
    setMenuOpen(false);
    setError(null);
    setActiveFormat(format);

    const dataset: ExportDataset = {
      title,
      filenameBase,
      columns,
      rows,
      filterSummary,
      emptyMessage,
      printOrientation,
    };

    try {
      if (format === "print") {
        await runPrint(dataset);
      } else {
        await runExport(dataset, format);
      }
    } catch (actionError) {
      const message =
        actionError instanceof Error
          ? actionError.message
          : "The export action could not be completed.";
      setError(message);
    } finally {
      setActiveFormat(null);
    }
  }

  return (
    <div
      ref={rootRef}
      className={["relative inline-flex flex-col items-start", className ?? ""].join(" ")}
    >
      <Button
        variant={variant}
        className={buttonClassName}
        disabled={activeFormat !== null}
        onClick={() => setMenuOpen((current) => !current)}
      >
        {labelForLoading(activeFormat) ?? triggerLabel}
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
      </Button>

      {menuOpen ? (
        <div className="absolute left-0 top-full z-40 mt-2 min-w-[12rem] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-lg">
          {ACTIONS.map((action) => (
            <button
              key={action.format}
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-[var(--text-strong)] transition hover:bg-[var(--surface-muted)]"
              onClick={() => handleAction(action.format)}
            >
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-[var(--status-danger-fg)]">{error}</p> : null}
    </div>
  );
}
