"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { useDashboardSession } from "@/components/layout/dashboard-session-provider";
import {
  MasterRowLimitControl,
  MasterTablePagination,
  paginateRows,
  type RowLimitOption,
} from "@/components/master/master-table-pagination";
import {
  buildDefaultColumnVisibility,
  useMasterColumns,
  type MasterColumnDefinition,
} from "@/components/master/use-master-columns";
import type { ExportColumn } from "@/lib/export/contracts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { fetchJson } from "@/lib/utils/fetch-json";
import { fetchAllHistoryItems } from "../_components/fetch-all-history-items";
import { TransactionListSettingsMenu } from "../_components/transaction-list-settings-menu";
import { TransactionRowActionsMenu } from "../_components/transaction-row-actions-menu";
import { useHistoryAutoRefresh } from "../_components/use-history-auto-refresh";

type TransferLine = {
  id: string;
  product_id: string;
  product_sku_snapshot: string | null;
  product_name_snapshot: string | null;
  product_barcode_snapshot: string | null;
  requested_qty: number;
  dispatched_qty: number;
  received_qty: number;
};

type Transfer = {
  id: string;
  transfer_number: string;
  status: string;
  from_location_id: string;
  to_location_id: string;
  notes?: string | null;
  created_at: string;
  transfer_lines?: TransferLine[];
};

type Lookup = {
  id: string;
  name: string;
  code?: string;
  sku?: string;
};

type Section = "material-request" | "material-transfer" | "direct-transfer";

type RequestHistoryColumnKey =
  | "number"
  | "from"
  | "to"
  | "items"
  | "qty"
  | "created";
type TransferQueueColumnKey =
  | "number"
  | "status"
  | "from"
  | "to"
  | "items"
  | "qty"
  | "created";
type DirectHistoryColumnKey =
  | "number"
  | "status"
  | "from"
  | "to"
  | "created"
  | "notes";

const DIRECT_NOTE_PREFIX = "[DIRECT]";

const REQUEST_HISTORY_DEFAULT_COLUMN_ORDER: readonly RequestHistoryColumnKey[] = [
  "number",
  "from",
  "to",
  "items",
  "qty",
  "created",
];
const TRANSFER_QUEUE_DEFAULT_COLUMN_ORDER: readonly TransferQueueColumnKey[] = [
  "number",
  "status",
  "from",
  "to",
  "items",
  "qty",
  "created",
];
const DIRECT_HISTORY_DEFAULT_COLUMN_ORDER: readonly DirectHistoryColumnKey[] = [
  "number",
  "status",
  "from",
  "to",
  "created",
  "notes",
];

const REQUEST_HISTORY_DEFAULT_COLUMN_VISIBILITY =
  buildDefaultColumnVisibility<RequestHistoryColumnKey>(
    REQUEST_HISTORY_DEFAULT_COLUMN_ORDER,
  );
const TRANSFER_QUEUE_DEFAULT_COLUMN_VISIBILITY =
  buildDefaultColumnVisibility<TransferQueueColumnKey>(
    TRANSFER_QUEUE_DEFAULT_COLUMN_ORDER,
  );
const DIRECT_HISTORY_DEFAULT_COLUMN_VISIBILITY =
  buildDefaultColumnVisibility<DirectHistoryColumnKey>(
    DIRECT_HISTORY_DEFAULT_COLUMN_ORDER,
  );

const REQUEST_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "number", label: "Number" },
  { key: "from", label: "From" },
  { key: "to", label: "To" },
  { key: "items", label: "Items" },
  { key: "qty", label: "Qty" },
  { key: "created_at", label: "Created" },
];

const TRANSFER_QUEUE_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "number", label: "Number" },
  { key: "status", label: "Status" },
  { key: "from", label: "From" },
  { key: "to", label: "To" },
  { key: "items", label: "Items" },
  { key: "qty", label: "Qty" },
  { key: "created_at", label: "Created" },
];

const DIRECT_HISTORY_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "number", label: "Number" },
  { key: "status", label: "Status" },
  { key: "from", label: "From" },
  { key: "to", label: "To" },
  { key: "created_at", label: "Created" },
  { key: "notes", label: "Notes" },
];

function isDirectTransfer(transfer: Transfer) {
  return (transfer.notes ?? "").startsWith(DIRECT_NOTE_PREFIX);
}

function getTransferItemCount(transfer: Transfer) {
  return transfer.transfer_lines?.length ?? 0;
}

function getTransferRequestedQty(transfer: Transfer) {
  return (transfer.transfer_lines ?? []).reduce(
    (total, line) => total + Number(line.requested_qty ?? 0),
    0,
  );
}

export default function TransfersPage() {
  const { userId: authUserId } = useDashboardSession();
  const router = useRouter();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [locations, setLocations] = useState<Lookup[]>([]);
  const [products, setProducts] = useState<Lookup[]>([]);
  const [section, setSection] = useState<Section>("material-request");
  const [message, setMessage] = useState<string | null>(null);
  const [requestLoading, setRequestLoading] = useState(false);
  const [directLoading, setDirectLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editingTransferId, setEditingTransferId] = useState<string | null>(null);
  const [requestHistoryPage, setRequestHistoryPage] = useState(1);
  const [requestHistoryRowLimit, setRequestHistoryRowLimit] = useState<RowLimitOption>(10);
  const [transferQueuePage, setTransferQueuePage] = useState(1);
  const [transferQueueRowLimit, setTransferQueueRowLimit] = useState<RowLimitOption>(10);
  const [directHistoryPage, setDirectHistoryPage] = useState(1);
  const [directHistoryRowLimit, setDirectHistoryRowLimit] = useState<RowLimitOption>(10);
  const [editForm, setEditForm] = useState({
    from_location_id: "",
    to_location_id: "",
    product_id: "",
    requested_qty: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const requestHistoryColumns = useMemo<
    readonly MasterColumnDefinition<RequestHistoryColumnKey>[]
  >(
    () => [
      { key: "number", label: "Number" },
      { key: "from", label: "From" },
      { key: "to", label: "To" },
      { key: "items", label: "Items" },
      { key: "qty", label: "Qty" },
      { key: "created", label: "Created" },
    ],
    [],
  );
  const transferQueueColumns = useMemo<
    readonly MasterColumnDefinition<TransferQueueColumnKey>[]
  >(
    () => [
      { key: "number", label: "Number" },
      { key: "status", label: "Status" },
      { key: "from", label: "From" },
      { key: "to", label: "To" },
      { key: "items", label: "Items" },
      { key: "qty", label: "Qty" },
      { key: "created", label: "Created" },
    ],
    [],
  );
  const directHistoryColumns = useMemo<
    readonly MasterColumnDefinition<DirectHistoryColumnKey>[]
  >(
    () => [
      { key: "number", label: "Number" },
      { key: "status", label: "Status" },
      { key: "from", label: "From" },
      { key: "to", label: "To" },
      { key: "created", label: "Created" },
      { key: "notes", label: "Notes" },
    ],
    [],
  );
  const {
    orderedColumns: orderedRequestHistoryColumns,
    visibleColumns: visibleRequestHistoryColumns,
    columnVisibility: requestHistoryColumnVisibility,
    toggleColumnVisibility: toggleRequestHistoryColumnVisibility,
    moveColumn: moveRequestHistoryColumn,
    resetColumnPreferences: resetRequestHistoryColumnPreferences,
  } = useMasterColumns({
    userId: authUserId,
    storageKey: `ims:transfers:requests:columns:${authUserId}`,
    columns: requestHistoryColumns,
    defaultOrder: REQUEST_HISTORY_DEFAULT_COLUMN_ORDER,
    defaultVisibility: REQUEST_HISTORY_DEFAULT_COLUMN_VISIBILITY,
  });
  const {
    orderedColumns: orderedTransferQueueColumns,
    visibleColumns: visibleTransferQueueColumns,
    columnVisibility: transferQueueColumnVisibility,
    toggleColumnVisibility: toggleTransferQueueColumnVisibility,
    moveColumn: moveTransferQueueColumn,
    resetColumnPreferences: resetTransferQueueColumnPreferences,
  } = useMasterColumns({
    userId: authUserId,
    storageKey: `ims:transfers:queue:columns:${authUserId}`,
    columns: transferQueueColumns,
    defaultOrder: TRANSFER_QUEUE_DEFAULT_COLUMN_ORDER,
    defaultVisibility: TRANSFER_QUEUE_DEFAULT_COLUMN_VISIBILITY,
  });
  const {
    orderedColumns: orderedDirectHistoryColumns,
    visibleColumns: visibleDirectHistoryColumns,
    columnVisibility: directHistoryColumnVisibility,
    toggleColumnVisibility: toggleDirectHistoryColumnVisibility,
    moveColumn: moveDirectHistoryColumn,
    resetColumnPreferences: resetDirectHistoryColumnPreferences,
  } = useMasterColumns({
    userId: authUserId,
    storageKey: `ims:transfers:direct:columns:${authUserId}`,
    columns: directHistoryColumns,
    defaultOrder: DIRECT_HISTORY_DEFAULT_COLUMN_ORDER,
    defaultVisibility: DIRECT_HISTORY_DEFAULT_COLUMN_VISIBILITY,
  });

  async function loadTransfers(signal?: AbortSignal) {
    const result = await fetchAllHistoryItems<Transfer>("/api/transfers", {
      signal,
      fallbackError: "Failed to load transfers.",
    });

    if (!result.ok) {
      if (result.error !== "Request aborted.") {
        setError(result.error);
      }
      return;
    }

    setTransfers(result.data);
  }

  async function loadLookups(signal?: AbortSignal) {
    const [locationsResult, productsResult] = await Promise.all([
      fetchJson<{ items?: Lookup[]; error?: string }>("/api/locations", {
        signal,
        fallbackError: "Failed to load locations.",
      }),
      fetchJson<{ items?: Lookup[]; error?: string }>("/api/products", {
        signal,
        fallbackError: "Failed to load products.",
      }),
    ]);

    if (!locationsResult.ok) {
      if (locationsResult.error !== "Request aborted.") {
        setError(locationsResult.error);
      }
      return;
    }
    if (!productsResult.ok) {
      if (productsResult.error !== "Request aborted.") {
        setError(productsResult.error);
      }
      return;
    }

    setLocations(locationsResult.data.items ?? []);
    setProducts(productsResult.data.items ?? []);
  }

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([loadTransfers(controller.signal), loadLookups(controller.signal)]).catch(() =>
      setError("Failed to load transfer data."),
    );
    return () => controller.abort();
  }, []);

  useHistoryAutoRefresh(() => loadTransfers());

  const locationById = useMemo(() => {
    const mapped = new Map<string, Lookup>();
    for (const location of locations) {
      mapped.set(location.id, location);
    }
    return mapped;
  }, [locations]);

  const materialTransfers = useMemo(
    () => transfers.filter((transfer) => !isDirectTransfer(transfer)),
    [transfers],
  );
  const materialRequests = useMemo(
    () => materialTransfers.filter((transfer) => transfer.status === "REQUESTED"),
    [materialTransfers],
  );
  const directTransfers = useMemo(
    () => transfers.filter((transfer) => isDirectTransfer(transfer)),
    [transfers],
  );
  const paginatedMaterialRequests = useMemo(
    () => paginateRows(materialRequests, requestHistoryRowLimit, requestHistoryPage),
    [materialRequests, requestHistoryPage, requestHistoryRowLimit],
  );
  const paginatedMaterialTransfers = useMemo(
    () => paginateRows(materialTransfers, transferQueueRowLimit, transferQueuePage),
    [materialTransfers, transferQueuePage, transferQueueRowLimit],
  );
  const paginatedDirectTransfers = useMemo(
    () => paginateRows(directTransfers, directHistoryRowLimit, directHistoryPage),
    [directHistoryPage, directHistoryRowLimit, directTransfers],
  );

  function formatLookup(lookup: Lookup | undefined, fallback: string) {
    if (!lookup) {
      return "--";
    }
    const code = lookup.code ?? lookup.sku ?? fallback;
    return `${code} - ${lookup.name}`;
  }

  const requestExportRows = useMemo(
    () =>
      materialRequests.map((transfer) => ({
        number: transfer.transfer_number,
        from: formatLookup(locationById.get(transfer.from_location_id), "LOC"),
        to: formatLookup(locationById.get(transfer.to_location_id), "LOC"),
        items: getTransferItemCount(transfer),
        qty: getTransferRequestedQty(transfer),
        created_at: new Date(transfer.created_at).toLocaleString(),
      })),
    [locationById, materialRequests],
  );

  const transferQueueExportRows = useMemo(
    () =>
      materialTransfers.map((transfer) => ({
        number: transfer.transfer_number,
        status: transfer.status,
        from: formatLookup(locationById.get(transfer.from_location_id), "LOC"),
        to: formatLookup(locationById.get(transfer.to_location_id), "LOC"),
        items: getTransferItemCount(transfer),
        qty: getTransferRequestedQty(transfer),
        created_at: new Date(transfer.created_at).toLocaleString(),
      })),
    [locationById, materialTransfers],
  );

  const directHistoryExportRows = useMemo(
    () =>
      directTransfers.map((transfer) => ({
        number: transfer.transfer_number,
        status: transfer.status,
        from: formatLookup(locationById.get(transfer.from_location_id), "LOC"),
        to: formatLookup(locationById.get(transfer.to_location_id), "LOC"),
        created_at: new Date(transfer.created_at).toLocaleString(),
        notes:
          (transfer.notes ?? "")
            .replace(DIRECT_NOTE_PREFIX, "")
            .trim() || "--",
      })),
    [directTransfers, locationById],
  );

  async function createMaterialRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestLoading(true);
    setError(null);
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      from_location_id: String(formData.get("from_location_id") ?? ""),
      to_location_id: String(formData.get("to_location_id") ?? ""),
      notes: String(formData.get("notes") ?? "") || null,
      lines: [
        {
          product_id: String(formData.get("product_id") ?? ""),
          requested_qty: Number(formData.get("requested_qty") ?? 0),
        },
      ],
    };

    try {
      const result = await fetchJson<{ error?: string }>("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        fallbackError: "Failed to create material request.",
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      (event.currentTarget as HTMLFormElement).reset();
      setMessage("Material request created.");
      await loadTransfers();
    } finally {
      setRequestLoading(false);
    }
  }

  async function createDirectTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDirectLoading(true);
    setError(null);
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      from_location_id: String(formData.get("from_location_id") ?? ""),
      to_location_id: String(formData.get("to_location_id") ?? ""),
      notes: String(formData.get("notes") ?? "") || null,
      lines: [
        {
          product_id: String(formData.get("product_id") ?? ""),
          requested_qty: Number(formData.get("requested_qty") ?? 0),
        },
      ],
    };

    try {
      const result = await fetchJson<{ error?: string }>("/api/transfers/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        fallbackError: "Failed to create direct transfer.",
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      (event.currentTarget as HTMLFormElement).reset();
      setMessage("Direct transfer completed.");
      await loadTransfers();
    } finally {
      setDirectLoading(false);
    }
  }

  async function approveTransfer(id: string) {
    setActionLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await fetchJson<{ error?: string }>(`/api/transfers/${id}/approve`, {
        method: "POST",
        fallbackError: "Failed to approve transfer.",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage("Material request approved.");
      await loadTransfers();
    } finally {
      setActionLoading(false);
    }
  }

  async function rejectTransfer(transfer: Transfer) {
    const reason = window.prompt("Reject reason (optional)") ?? "";

    setActionLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await fetchJson<{ error?: string }>(`/api/transfers/${transfer.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: reason.trim() || undefined }),
        fallbackError: "Failed to reject transfer.",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage(`Transfer ${transfer.transfer_number} rejected.`);
      await loadTransfers();
    } finally {
      setActionLoading(false);
    }
  }

  async function transferMaterial(transfer: Transfer) {
    setActionLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (transfer.status === "APPROVED") {
        const dispatchResult = await fetchJson<{ error?: string }>(
          `/api/transfers/${transfer.id}/dispatch`,
          {
            method: "POST",
            fallbackError: "Failed to dispatch transfer.",
          },
        );
        if (!dispatchResult.ok) {
          setError(dispatchResult.error);
          return;
        }
      }

      const receiveResult = await fetchJson<{ error?: string }>(
        `/api/transfers/${transfer.id}/receive`,
        {
          method: "POST",
          fallbackError: "Dispatch succeeded but receive failed. You can retry from this row.",
        },
      );
      if (!receiveResult.ok) {
        setError(receiveResult.error);
        await loadTransfers();
        return;
      }

      setMessage(`Transfer ${transfer.transfer_number} completed.`);
      await loadTransfers();
    } finally {
      setActionLoading(false);
    }
  }

  function startEditTransfer(transfer: Transfer) {
    const firstLine = transfer.transfer_lines?.[0];
    if (!firstLine) {
      setError("Transfer has no editable lines.");
      return;
    }
    setEditingTransferId(transfer.id);
    setEditForm({
      from_location_id: transfer.from_location_id,
      to_location_id: transfer.to_location_id,
      product_id: firstLine.product_id,
      requested_qty: String(firstLine.requested_qty),
      notes: transfer.notes ?? "",
    });
    setSection("material-transfer");
  }

  async function saveEditTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTransferId) {
      return;
    }

    setEditLoading(true);
    setError(null);
    setMessage(null);

    const payload = {
      from_location_id: editForm.from_location_id,
      to_location_id: editForm.to_location_id,
      notes: editForm.notes.trim() || null,
      lines: [
        {
          product_id: editForm.product_id,
          requested_qty: Number(editForm.requested_qty),
        },
      ],
    };

    try {
      const result = await fetchJson<{ error?: string }>(
        `/api/transfers/${editingTransferId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          fallbackError: "Failed to edit transfer.",
        },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setEditingTransferId(null);
      setEditForm({
        from_location_id: "",
        to_location_id: "",
        product_id: "",
        requested_qty: "",
        notes: "",
      });
      setMessage("Material request updated.");
      await loadTransfers();
    } finally {
      setEditLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="ims-kicker">Transfers</p>
        <h1 className="ims-title">Transfers</h1>
        <p className="ims-subtitle">
          Material Request, Material Transfer workflow, and Direct Transfer.
        </p>
      </header>

      {error ? <p className="ims-alert-danger">{error}</p> : null}
      {message ? <p className="ims-alert-success">{message}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant={section === "material-request" ? "secondary" : "ghost"}
          className="ims-control-md"
          onClick={() => setSection("material-request")}
        >
          Material Request
        </Button>
        <Button
          variant={section === "material-transfer" ? "secondary" : "ghost"}
          className="ims-control-md"
          onClick={() => setSection("material-transfer")}
        >
          Material Transfer
        </Button>
        <Button
          variant={section === "direct-transfer" ? "secondary" : "ghost"}
          className="ims-control-md"
          onClick={() => setSection("direct-transfer")}
        >
          Direct Transfer
        </Button>
      </div>

      {section === "material-request" ? (
        <>
          <Card className="min-h-[18rem]">
            <h2 className="text-lg font-semibold">Create Material Request</h2>
            <form onSubmit={createMaterialRequest} className="mt-4 grid gap-3 md:grid-cols-5">
              <Select name="from_location_id" required className="ims-control-lg">
                <option value="">From location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {formatLookup(location, "LOC")}
                  </option>
                ))}
              </Select>
              <Select name="to_location_id" required className="ims-control-lg">
                <option value="">To location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {formatLookup(location, "LOC")}
                  </option>
                ))}
              </Select>
              <Select name="product_id" required className="ims-control-lg">
                <option value="">Product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {formatLookup(product, "SKU")}
                  </option>
                ))}
              </Select>
              <Input
                name="requested_qty"
                type="number"
                min={1}
                required
                placeholder="Qty"
                className="ims-control-lg"
              />
              <Button type="submit" disabled={requestLoading} className="ims-control-lg rounded-2xl">
                {requestLoading ? "Saving..." : "Create Request"}
              </Button>
              <Input name="notes" placeholder="Notes" className="ims-control-lg md:col-span-5" />
            </form>
          </Card>

          <Card className="min-h-[20rem]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
                <MasterRowLimitControl
                  value={requestHistoryRowLimit}
                  onChange={(limit) => {
                    setRequestHistoryRowLimit(limit);
                    setRequestHistoryPage(1);
                  }}
                />
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">Open Material Requests</h2>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <TransactionListSettingsMenu
                  orderedColumns={orderedRequestHistoryColumns}
                  columnVisibility={requestHistoryColumnVisibility}
                  onToggleColumn={toggleRequestHistoryColumnVisibility}
                  onMoveColumn={moveRequestHistoryColumn}
                  onResetColumns={resetRequestHistoryColumnPreferences}
                  exportTitle="Open Material Requests"
                  exportFilenameBase="open-material-requests"
                  exportColumns={REQUEST_EXPORT_COLUMNS}
                  exportRows={requestExportRows}
                  exportEmptyMessage="No open material requests available."
                />
              </div>
            </div>
            <div className="mt-4 max-h-[28rem] overflow-auto">
              <table className="ims-table ims-master-table">
                <thead className="ims-table-head">
                  <tr>
                    {visibleRequestHistoryColumns.map((column) => (
                      <th key={column.key} data-column-key={column.key}>
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedMaterialRequests.items.map((transfer) => {
                    const detailHref = `/transactions/transfers/${transfer.id}`;
                    return (
                      <tr
                        key={transfer.id}
                        className="ims-table-row cursor-pointer"
                        onClick={() => router.push(detailHref)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            router.push(detailHref);
                          }
                        }}
                        role="link"
                        tabIndex={0}
                      >
                        {visibleRequestHistoryColumns.map((column) => (
                          <td key={column.key} data-column-key={column.key}>
                            {column.key === "number" ? (
                              <Link
                                href={detailHref}
                                className="font-medium underline-offset-4 hover:underline"
                                onClick={(event) => event.stopPropagation()}
                              >
                                {transfer.transfer_number}
                              </Link>
                            ) : null}
                            {column.key === "from"
                              ? formatLookup(locationById.get(transfer.from_location_id), "LOC")
                              : null}
                            {column.key === "to"
                              ? formatLookup(locationById.get(transfer.to_location_id), "LOC")
                              : null}
                            {column.key === "items"
                              ? `${getTransferItemCount(transfer)} item${getTransferItemCount(transfer) === 1 ? "" : "s"}`
                              : null}
                            {column.key === "qty" ? getTransferRequestedQty(transfer) : null}
                            {column.key === "created"
                              ? new Date(transfer.created_at).toLocaleString()
                              : null}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {paginatedMaterialRequests.totalItems === 0 ? (
                <p className="ims-empty mt-3">No open material requests.</p>
              ) : null}
            </div>
            <MasterTablePagination
              totalItems={paginatedMaterialRequests.totalItems}
              currentPage={paginatedMaterialRequests.currentPage}
              rowLimit={requestHistoryRowLimit}
              onPageChange={setRequestHistoryPage}
            />
          </Card>
        </>
      ) : null}

      {section === "material-transfer" ? (
        <>
          {editingTransferId ? (
            <Card className="min-h-[14rem]">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Edit Material Request</h2>
                <Button
                  variant="ghost"
                  className="ims-control-sm"
                  onClick={() => {
                    setEditingTransferId(null);
                    setEditForm({
                      from_location_id: "",
                      to_location_id: "",
                      product_id: "",
                      requested_qty: "",
                      notes: "",
                    });
                  }}
                >
                  Cancel
                </Button>
              </div>
              <form onSubmit={saveEditTransfer} className="mt-4 grid gap-3 md:grid-cols-5">
                <Select
                  required
                  className="ims-control-lg"
                  value={editForm.from_location_id}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, from_location_id: event.target.value }))
                  }
                >
                  <option value="">From location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {formatLookup(location, "LOC")}
                    </option>
                  ))}
                </Select>
                <Select
                  required
                  className="ims-control-lg"
                  value={editForm.to_location_id}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, to_location_id: event.target.value }))
                  }
                >
                  <option value="">To location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {formatLookup(location, "LOC")}
                    </option>
                  ))}
                </Select>
                <Select
                  required
                  className="ims-control-lg"
                  value={editForm.product_id}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, product_id: event.target.value }))
                  }
                >
                  <option value="">Product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {formatLookup(product, "SKU")}
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  min={1}
                  required
                  className="ims-control-lg"
                  value={editForm.requested_qty}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, requested_qty: event.target.value }))
                  }
                />
                <Button type="submit" className="ims-control-lg rounded-2xl" disabled={editLoading}>
                  {editLoading ? "Saving..." : "Save Changes"}
                </Button>
                <Input
                  className="ims-control-lg md:col-span-5"
                  value={editForm.notes}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </form>
            </Card>
          ) : null}

          <Card className="min-h-[24rem]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
                <MasterRowLimitControl
                  value={transferQueueRowLimit}
                  onChange={(limit) => {
                    setTransferQueueRowLimit(limit);
                    setTransferQueuePage(1);
                  }}
                />
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">Material Transfer Queue</h2>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <TransactionListSettingsMenu
                  orderedColumns={orderedTransferQueueColumns}
                  columnVisibility={transferQueueColumnVisibility}
                  onToggleColumn={toggleTransferQueueColumnVisibility}
                  onMoveColumn={moveTransferQueueColumn}
                  onResetColumns={resetTransferQueueColumnPreferences}
                  exportTitle="Material Transfer Queue"
                  exportFilenameBase="material-transfer-queue"
                  exportColumns={TRANSFER_QUEUE_EXPORT_COLUMNS}
                  exportRows={transferQueueExportRows}
                  exportEmptyMessage="No material transfers available."
                />
              </div>
            </div>
            <div className="mt-4 max-h-[34rem] overflow-auto">
              <table className="ims-table ims-master-table">
                <thead className="ims-table-head">
                  <tr>
                    {visibleTransferQueueColumns.map((column) => (
                      <th key={column.key} data-column-key={column.key}>
                        {column.label}
                      </th>
                    ))}
                    <th data-column-key="action">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedMaterialTransfers.items.map((transfer) => {
                    const detailHref = `/transactions/transfers/${transfer.id}`;
                    return (
                      <tr
                        key={transfer.id}
                        className="ims-table-row cursor-pointer"
                        onClick={() => router.push(detailHref)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            router.push(detailHref);
                          }
                        }}
                        role="link"
                        tabIndex={0}
                      >
                        {visibleTransferQueueColumns.map((column) => (
                          <td key={column.key} data-column-key={column.key}>
                            {column.key === "number" ? (
                              <Link
                                href={detailHref}
                                className="font-medium underline-offset-4 hover:underline"
                                onClick={(event) => event.stopPropagation()}
                              >
                                {transfer.transfer_number}
                              </Link>
                            ) : null}
                            {column.key === "status" ? transfer.status : null}
                            {column.key === "from"
                              ? formatLookup(locationById.get(transfer.from_location_id), "LOC")
                              : null}
                            {column.key === "to"
                              ? formatLookup(locationById.get(transfer.to_location_id), "LOC")
                              : null}
                            {column.key === "items"
                              ? `${getTransferItemCount(transfer)} item${getTransferItemCount(transfer) === 1 ? "" : "s"}`
                              : null}
                            {column.key === "qty" ? getTransferRequestedQty(transfer) : null}
                            {column.key === "created"
                              ? new Date(transfer.created_at).toLocaleString()
                              : null}
                          </td>
                        ))}
                        <td data-column-key="action">
                          <TransactionRowActionsMenu
                            actions={[
                              ...(transfer.status === "REQUESTED"
                                ? [
                                    {
                                      label: "Approve",
                                      disabled: actionLoading,
                                      onSelect: () => approveTransfer(transfer.id),
                                    },
                                    {
                                      label: "Edit",
                                      disabled: actionLoading || editLoading,
                                      onSelect: () => startEditTransfer(transfer),
                                    },
                                    {
                                      label: "Reject",
                                      disabled: actionLoading,
                                      tone: "danger" as const,
                                      onSelect: () => rejectTransfer(transfer),
                                    },
                                  ]
                                : []),
                              ...(transfer.status === "APPROVED"
                                ? [
                                    {
                                      label: "Transfer",
                                      disabled: actionLoading,
                                      onSelect: () => transferMaterial(transfer),
                                    },
                                    {
                                      label: "Reject",
                                      disabled: actionLoading,
                                      tone: "danger" as const,
                                      onSelect: () => rejectTransfer(transfer),
                                    },
                                  ]
                                : []),
                              ...(transfer.status === "DISPATCHED"
                                ? [
                                    {
                                      label: "Receive",
                                      disabled: actionLoading,
                                      onSelect: () => transferMaterial(transfer),
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {paginatedMaterialTransfers.totalItems === 0 ? (
                <p className="ims-empty mt-3">No material transfers found.</p>
              ) : null}
            </div>
            <MasterTablePagination
              totalItems={paginatedMaterialTransfers.totalItems}
              currentPage={paginatedMaterialTransfers.currentPage}
              rowLimit={transferQueueRowLimit}
              onPageChange={setTransferQueuePage}
            />
          </Card>
        </>
      ) : null}

      {section === "direct-transfer" ? (
        <>
          <Card className="min-h-[18rem]">
            <h2 className="text-lg font-semibold">Create Direct Transfer</h2>
            <form onSubmit={createDirectTransfer} className="mt-4 grid gap-3 md:grid-cols-5">
              <Select name="from_location_id" required className="ims-control-lg">
                <option value="">From location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {formatLookup(location, "LOC")}
                  </option>
                ))}
              </Select>
              <Select name="to_location_id" required className="ims-control-lg">
                <option value="">To location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {formatLookup(location, "LOC")}
                  </option>
                ))}
              </Select>
              <Select name="product_id" required className="ims-control-lg">
                <option value="">Product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {formatLookup(product, "SKU")}
                  </option>
                ))}
              </Select>
              <Input
                name="requested_qty"
                type="number"
                min={1}
                required
                placeholder="Qty"
                className="ims-control-lg"
              />
              <Button type="submit" disabled={directLoading} className="ims-control-lg rounded-2xl">
                {directLoading ? "Transferring..." : "Transfer Now"}
              </Button>
              <Input name="notes" placeholder="Notes" className="ims-control-lg md:col-span-5" />
            </form>
          </Card>

          <Card className="min-h-[20rem]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
                <MasterRowLimitControl
                  value={directHistoryRowLimit}
                  onChange={(limit) => {
                    setDirectHistoryRowLimit(limit);
                    setDirectHistoryPage(1);
                  }}
                />
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">Direct Transfer History</h2>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <TransactionListSettingsMenu
                  orderedColumns={orderedDirectHistoryColumns}
                  columnVisibility={directHistoryColumnVisibility}
                  onToggleColumn={toggleDirectHistoryColumnVisibility}
                  onMoveColumn={moveDirectHistoryColumn}
                  onResetColumns={resetDirectHistoryColumnPreferences}
                  exportTitle="Direct Transfer History"
                  exportFilenameBase="direct-transfer-history"
                  exportColumns={DIRECT_HISTORY_EXPORT_COLUMNS}
                  exportRows={directHistoryExportRows}
                  exportEmptyMessage="No direct transfer history rows available."
                />
              </div>
            </div>
            <div className="mt-4 max-h-[28rem] overflow-auto">
              <table className="ims-table ims-master-table">
                <thead className="ims-table-head">
                  <tr>
                    {visibleDirectHistoryColumns.map((column) => (
                      <th key={column.key} data-column-key={column.key}>
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedDirectTransfers.items.map((transfer) => {
                    const detailHref = `/transactions/transfers/${transfer.id}`;
                    return (
                      <tr
                        key={transfer.id}
                        className="ims-table-row cursor-pointer"
                        onClick={() => router.push(detailHref)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            router.push(detailHref);
                          }
                        }}
                        role="link"
                        tabIndex={0}
                      >
                        {visibleDirectHistoryColumns.map((column) => (
                          <td key={column.key} data-column-key={column.key}>
                            {column.key === "number" ? (
                              <Link
                                href={detailHref}
                                className="font-medium underline-offset-4 hover:underline"
                                onClick={(event) => event.stopPropagation()}
                              >
                                {transfer.transfer_number}
                              </Link>
                            ) : null}
                            {column.key === "status" ? transfer.status : null}
                            {column.key === "from"
                              ? formatLookup(locationById.get(transfer.from_location_id), "LOC")
                              : null}
                            {column.key === "to"
                              ? formatLookup(locationById.get(transfer.to_location_id), "LOC")
                              : null}
                            {column.key === "created"
                              ? new Date(transfer.created_at).toLocaleString()
                              : null}
                            {column.key === "notes"
                              ? (transfer.notes ?? "")
                                  .replace(DIRECT_NOTE_PREFIX, "")
                                  .trim() || "--"
                              : null}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {paginatedDirectTransfers.totalItems === 0 ? (
                <p className="ims-empty mt-3">No direct transfers found.</p>
              ) : null}
            </div>
            <MasterTablePagination
              totalItems={paginatedDirectTransfers.totalItems}
              currentPage={paginatedDirectTransfers.currentPage}
              rowLimit={directHistoryRowLimit}
              onPageChange={setDirectHistoryPage}
            />
          </Card>
        </>
      ) : null}
    </div>
  );
}

