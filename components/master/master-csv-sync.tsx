"use client";

import { type ReactNode, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilePicker } from "@/components/ui/file-picker";
import {
  MasterEntity,
  MasterImportSummary,
} from "@/lib/master-sync/contracts";
import { fetchJson } from "@/lib/utils/fetch-json";

type MasterCsvSyncProps = {
  entity: MasterEntity;
  canManage: boolean;
  onImported?: () => Promise<void> | void;
  showDefaultImportControls?: boolean;
  children?: ReactNode;
  secondaryActions?: ReactNode;
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
  showDefaultImportControls = true,
  children,
  secondaryActions,
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

  const showPrimaryImportControls = showDefaultImportControls && canManage;
  const showSecondaryDivider = Boolean(children || showPrimaryImportControls);
  const hasVisibleContent = Boolean(
    error || message || children || secondaryActions || showPrimaryImportControls,
  );

  if (!hasVisibleContent) {
    return null;
  }

  return (
    <Card className="space-y-4">
      {error ? <p className="ims-alert-danger">{error}</p> : null}
      {message ? <p className="ims-alert-success">{message}</p> : null}

      {children ? <div>{children}</div> : null}

      {showPrimaryImportControls ? (
        <div
          className={`flex flex-wrap items-center gap-3 ${
            children ? "border-t border-[var(--line)] pt-4" : ""
          }`}
        >
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
              {loading ? "Uploading..." : "Upload"}
            </Button>
          </>
        </div>
      ) : null}

      {secondaryActions ? (
        <div className={showSecondaryDivider ? "border-t border-[var(--line)] pt-4" : undefined}>
          {secondaryActions}
        </div>
      ) : null}
    </Card>
  );
}
