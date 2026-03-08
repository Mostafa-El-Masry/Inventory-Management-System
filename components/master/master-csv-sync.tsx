"use client";

import { useRef, useState } from "react";

import { ExportActions } from "@/components/ui/export-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilePicker } from "@/components/ui/file-picker";
import type { ExportColumn, ExportRow } from "@/lib/export/contracts";
import {
  MasterEntity,
  MasterImportSummary,
} from "@/lib/master-sync/contracts";
import { fetchJson } from "@/lib/utils/fetch-json";

type MasterCsvSyncProps = {
  entity: MasterEntity;
  canManage: boolean;
  onImported?: () => Promise<void> | void;
  helperText?: string;
  title: string;
  filenameBase: string;
  rows: ExportRow[];
  columns: ExportColumn[];
  filterSummary?: string[];
};

const ENTITY_LABELS: Record<MasterEntity, string> = {
  locations: "Locations",
  products: "Products",
  categories: "Categories",
  subcategories: "Subcategories",
  suppliers: "Suppliers",
};

export function MasterCsvSync({
  entity,
  canManage,
  onImported,
  helperText,
  title,
  filenameBase,
  rows,
  columns,
  filterSummary,
}: MasterCsvSyncProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleImport() {
    if (!file || loading) {
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    let csvText = "";
    try {
      csvText = await file.text();
    } catch {
      setError("Failed to read selected file.");
      setLoading(false);
      return;
    }

    try {
      const result = await fetchJson<MasterImportSummary>(
        `/api/master/import?entity=${encodeURIComponent(entity)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv: csvText }),
          fallbackError: `${ENTITY_LABELS[entity]} reimport failed.`,
        },
      );

      if (!result.ok) {
        setError(result.error);
        return;
      }

      const summary = result.data;
      const summaryMessage = [
        `${ENTITY_LABELS[entity]} reimport complete.`,
        `Processed: ${summary.processed_count}.`,
        `Inserted: ${summary.inserted_count}.`,
        `Updated: ${summary.updated_count}.`,
        `Rejected: ${summary.rejected_count}.`,
      ].join(" ");
      setMessage(summaryMessage);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setFile(null);

      await onImported?.();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="min-h-[11rem]">
      <h2 className="text-lg font-semibold">Export & Reimport ({ENTITY_LABELS[entity]})</h2>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Export current {ENTITY_LABELS[entity].toLowerCase()} into CSV, Excel, PDF, or print.
        {canManage ? " CSV remains aligned to the reimport schema for strict key upsert." : ""}
      </p>
      {helperText ? <p className="mt-1 text-xs text-[var(--text-muted)]">{helperText}</p> : null}

      {error ? <p className="ims-alert-danger mt-3">{error}</p> : null}
      {message ? <p className="ims-alert-success mt-3">{message}</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <ExportActions
          title={title}
          filenameBase={filenameBase}
          columns={columns}
          rows={rows}
          filterSummary={filterSummary}
          emptyMessage={`No ${ENTITY_LABELS[entity].toLowerCase()} available.`}
          buttonClassName="ims-control-md rounded-2xl"
        />

        {canManage ? (
          <>
            <a href={`/api/master/import/template?entity=${encodeURIComponent(entity)}`}>
              <Button variant="secondary" className="ims-control-md rounded-2xl">
                Download Template
              </Button>
            </a>

            <FilePicker
              ref={fileInputRef}
              accept=".csv,text/csv"
              fileName={file?.name ?? null}
              className="ims-control-md w-full max-w-xl"
              onChange={(event) => {
                setError(null);
                setMessage(null);
                setFile(event.target.files?.[0] ?? null);
              }}
            />

            <Button
              className="ims-control-md rounded-2xl"
              onClick={() => handleImport()}
              disabled={loading || !file}
            >
              {loading ? "Reimporting..." : "Reimport CSV"}
            </Button>
          </>
        ) : null}
      </div>
    </Card>
  );
}
