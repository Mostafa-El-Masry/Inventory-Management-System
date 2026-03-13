"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useDashboardSession } from "@/components/layout/dashboard-session-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { MAIN_WAREHOUSE_NAME } from "@/lib/locations/main-warehouse-constants";
import type { TransactionDetailResponse } from "@/lib/types/api";
import { fetchJson } from "@/lib/utils/fetch-json";

type Lookup = {
  id: string;
  name: string;
  code?: string | null;
  sku?: string | null;
  barcode?: string | null;
};

type InvoiceLineDraft = {
  clientId: string;
  productId: string;
  qty: string;
  unitCost: string;
  lotNumber: string;
  expiryDate: string;
};

type PendingInvoiceLine = {
  quickCode: string;
  productId: string;
  qty: string;
  unitCost: string;
  lotNumber: string;
  expiryDate: string;
};

const EMPTY_PENDING_LINE: PendingInvoiceLine = {
  quickCode: "",
  productId: "",
  qty: "1",
  unitCost: "",
  lotNumber: "",
  expiryDate: "",
};

function createLineId() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-KW", {
    style: "currency",
    currency: "KWD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateInput(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(value: string | null | undefined) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

function buildLineTotal(line: InvoiceLineDraft) {
  const qty = Number(line.qty);
  const unitCost = Number(line.unitCost);
  if (!Number.isFinite(qty) || !Number.isFinite(unitCost)) {
    return 0;
  }

  return Number((qty * unitCost).toFixed(2));
}

// Legacy helper retained temporarily while invoice line rendering was migrated.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ProductDisplay({
  product,
  line,
}: {
  product?: Lookup;
  line: InvoiceLineDraft;
}) {
  return (
    <div>
      <p className="font-medium text-[var(--text-strong)]">
        {product ? `${product.sku ?? "SKU"} - ${product.name}` : "--"}
      </p>
      {line.lotNumber || line.expiryDate ? (
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {line.lotNumber ? `Lot ${line.lotNumber}` : "No lot"}
          {line.expiryDate ? ` • Exp ${formatDisplayDate(line.expiryDate)}` : ""}
        </p>
      ) : null}
    </div>
  );
}

function PurchaseLineProductDisplay({
  product,
  line,
}: {
  product?: Lookup;
  line: InvoiceLineDraft;
}) {
  return (
    <div>
      <p className="font-medium text-[var(--text-strong)]">
        {product ? `${product.sku ?? "SKU"} - ${product.name}` : "--"}
      </p>
      {line.lotNumber || line.expiryDate ? (
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {line.lotNumber ? `Lot ${line.lotNumber}` : "No lot"}
          {line.expiryDate ? ` | Exp ${formatDisplayDate(line.expiryDate)}` : ""}
        </p>
      ) : null}
    </div>
  );
}

export function PurchaseInvoicePage({
  transactionId,
  backHref,
  backLabel,
}: {
  transactionId?: string;
  backHref: string;
  backLabel: string;
}) {
  const router = useRouter();
  const { companyName } = useDashboardSession();
  const [suppliers, setSuppliers] = useState<Lookup[]>([]);
  const [products, setProducts] = useState<Lookup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState("DRAFT");
  const [txNumber, setTxNumber] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");
  const [pendingLine, setPendingLine] = useState<PendingInvoiceLine>(EMPTY_PENDING_LINE);
  const [lines, setLines] = useState<InvoiceLineDraft[]>([]);

  const canEdit = !transactionId || status === "DRAFT";
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const supplierName = useMemo(() => {
    const supplier = suppliers.find((item) => item.id === supplierId);
    if (!supplier) {
      return "--";
    }

    return supplier.code ? `${supplier.code} - ${supplier.name}` : supplier.name;
  }, [supplierId, suppliers]);
  const totalQty = useMemo(
    () => lines.reduce((total, line) => total + Number(line.qty || 0), 0),
    [lines],
  );
  const netAmount = useMemo(
    () => Number(lines.reduce((total, line) => total + buildLineTotal(line), 0).toFixed(2)),
    [lines],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setLoading(true);
      setError(null);

      const lookups = await Promise.all([
        fetchJson<{ items?: Lookup[] }>("/api/suppliers", {
          fallbackError: "Failed to load suppliers.",
        }),
        fetchJson<{ items?: Lookup[] }>("/api/products", {
          fallbackError: "Failed to load products.",
        }),
      ]);

      if (cancelled) {
        return;
      }

      const [suppliersResult, productsResult] = lookups;
      if (!suppliersResult.ok) {
        setError(suppliersResult.error);
        setLoading(false);
        return;
      }

      if (!productsResult.ok) {
        setError(productsResult.error);
        setLoading(false);
        return;
      }

      setSuppliers(suppliersResult.data.items ?? []);
      setProducts(productsResult.data.items ?? []);

      if (!transactionId) {
        setLoading(false);
        return;
      }

      const detailResult = await fetchJson<TransactionDetailResponse>(
        `/api/transactions/${transactionId}`,
        { fallbackError: "Failed to load purchase invoice." },
      );

      if (cancelled) {
        return;
      }

      if (!detailResult.ok) {
        setError(detailResult.error);
        setLoading(false);
        return;
      }

      const item = detailResult.data.item;
      if (item.type !== "RECEIPT") {
        setError("This page only supports purchase invoices.");
        setLoading(false);
        return;
      }

      setStatus(item.status);
      setTxNumber(item.tx_number);
      setCreatedAt(item.created_at);
      setSupplierId(item.supplier?.id ?? "");
      setSupplierInvoiceNumber(item.supplier_invoice_number ?? "");
      setSupplierInvoiceDate(formatDateInput(item.supplier_invoice_date || item.created_at));
      setNotes(item.notes ?? "");
      setLines(
        item.lines.map((line) => ({
          clientId: line.id || createLineId(),
          productId: line.product_id,
          qty: String(line.qty),
          unitCost:
            line.unit_cost == null || !Number.isFinite(line.unit_cost)
              ? ""
              : String(line.unit_cost),
          lotNumber: line.lot_number ?? "",
          expiryDate: formatDateInput(line.expiry_date),
        })),
      );
      setLoading(false);
    }

    void loadPage();
    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  function updateLine(clientId: string, key: keyof InvoiceLineDraft, value: string) {
    setLines((current) =>
      current.map((line) =>
        line.clientId === clientId ? { ...line, [key]: value } : line,
      ),
    );
  }

  function removeLine(clientId: string) {
    setLines((current) => current.filter((line) => line.clientId !== clientId));
  }

  function addPendingLine() {
    const normalizedQuickCode = pendingLine.quickCode.trim().toLowerCase();
    const resolvedProductId =
      pendingLine.productId ||
      products.find((product) => {
        const barcode = product.barcode?.trim().toLowerCase() ?? "";
        const sku = product.sku?.trim().toLowerCase() ?? "";
        return normalizedQuickCode.length > 0
          ? barcode === normalizedQuickCode || sku === normalizedQuickCode
          : false;
      })?.id ||
      "";

    if (!resolvedProductId) {
      setError("Select a product or enter a matching barcode / SKU.");
      return;
    }

    const qty = Number(pendingLine.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Quantity must be greater than zero.");
      return;
    }

    setError(null);
    setLines((current) => [
      ...current,
      {
        clientId: createLineId(),
        productId: resolvedProductId,
        qty: pendingLine.qty,
        unitCost: pendingLine.unitCost,
        lotNumber: pendingLine.lotNumber,
        expiryDate: pendingLine.expiryDate,
      },
    ]);
    setPendingLine(EMPTY_PENDING_LINE);
  }

  function buildPayload() {
    if (!supplierId) {
      return { error: "Supplier is required." } as const;
    }

    if (!supplierInvoiceNumber.trim()) {
      return { error: "Voucher number is required." } as const;
    }

    if (lines.length === 0) {
      return { error: "Add at least one line item." } as const;
    }

    const normalizedLines = lines.map((line) => {
      const qty = Number(line.qty);
      if (!line.productId || !Number.isFinite(qty) || qty <= 0) {
        return null;
      }

      const unitCostValue = line.unitCost.trim();
      const unitCost = unitCostValue === "" ? null : Number(unitCostValue);

      return {
        product_id: line.productId,
        qty,
        lot_number: line.lotNumber.trim() || null,
        expiry_date: line.expiryDate || null,
        unit_cost:
          unitCost == null || !Number.isFinite(unitCost) ? null : unitCost,
      };
    });

    if (normalizedLines.some((line) => line == null)) {
      return { error: "Every line must have a product and a valid quantity." } as const;
    }

    const cleanedLines = normalizedLines.filter(
      (line): line is NonNullable<(typeof normalizedLines)[number]> => line != null,
    );

    return {
      error: null,
      payload: {
        type: "RECEIPT" as const,
        source_location_id: null,
        destination_location_id: null,
        supplier_id: supplierId,
        supplier_invoice_number: supplierInvoiceNumber.trim(),
        supplier_invoice_date: supplierInvoiceDate || null,
        notes: notes.trim() || null,
        lines: cleanedLines,
      },
    } as const;
  }

  async function saveInvoice() {
    const payloadResult = buildPayload();
    if (payloadResult.error) {
      setError(payloadResult.error);
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const result = await fetchJson<{ id: string }>(
      transactionId ? `/api/transactions/${transactionId}` : "/api/transactions",
      {
        method: transactionId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadResult.payload),
        fallbackError: transactionId
          ? "Failed to update purchase invoice."
          : "Failed to save purchase invoice.",
      },
    );

    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (!transactionId) {
      router.replace(`/transactions/purchase/${result.data.id}`);
      return;
    }

    setMessage("Purchase invoice updated.");
  }

  async function runStatusAction(action: "submit" | "post") {
    if (!transactionId) {
      return;
    }

    setActionLoading(true);
    setError(null);
    setMessage(null);

    const result = await fetchJson<{ success?: boolean }>(
      `/api/transactions/${transactionId}/${action}`,
      {
        method: "POST",
        fallbackError:
          action === "submit"
            ? "Failed to submit purchase invoice."
            : "Failed to post purchase invoice.",
      },
    );

    setActionLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.refresh();
    setStatus(action === "submit" ? "SUBMITTED" : "POSTED");
    setMessage(
      action === "submit"
        ? "Purchase invoice submitted."
        : "Purchase invoice posted.",
    );
  }

  async function deleteInvoice() {
    if (!transactionId) {
      router.push(backHref);
      return;
    }

    if (!window.confirm("Delete this draft invoice?")) {
      return;
    }

    setActionLoading(true);
    setError(null);
    setMessage(null);

    const result = await fetchJson<{ success?: boolean }>(
      `/api/transactions/${transactionId}`,
      {
        method: "DELETE",
        fallbackError: "Failed to delete purchase invoice.",
      },
    );

    setActionLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.push(backHref);
  }

  return (
    <div className="purchase-invoice-page space-y-6">
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 12mm;
        }

        @media print {
          html,
          body,
          .ims-page,
          .ims-dashboard-shell,
          .ims-content {
            background: #ffffff !important;
          }

          body * {
            visibility: hidden !important;
          }

          .purchase-invoice-page,
          .purchase-invoice-page * {
            visibility: visible !important;
          }

          .purchase-invoice-page {
            position: absolute !important;
            inset: 0 !important;
            z-index: 9999 !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }

          .purchase-invoice-toolbar,
          .purchase-invoice-editor,
          .purchase-invoice-actions,
          .purchase-invoice-delete-column {
            display: none !important;
          }

          .purchase-invoice-document {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .purchase-invoice-document thead {
            display: table-header-group;
          }
        }
      `}</style>

      <header className="purchase-invoice-toolbar flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="ims-kicker">Transactions</p>
          <h1 className="ims-title">
            {transactionId ? "Purchase Invoice" : "New Purchase Invoice"}
          </h1>
          <p className="ims-subtitle">
            Build a multi-line supplier invoice, save it as a draft, then submit and post it from the same screen.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={backHref}
            className="inline-flex ims-control-md items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 text-[var(--text-strong)] transition hover:bg-[var(--surface-muted)]"
          >
            {backLabel}
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex ims-control-md items-center justify-center rounded-full border border-transparent bg-[var(--brand-primary)] px-4 font-medium text-[var(--text-strong)] transition hover:brightness-110"
          >
            Print A4
          </button>
        </div>
      </header>

      {error ? <p className="ims-alert-danger">{error}</p> : null}
      {message ? <p className="ims-alert-success">{message}</p> : null}

      {loading ? (
        <Card className="min-h-[24rem]">
          <p className="ims-kicker">Loading</p>
          <div className="mt-4 space-y-3">
            <div className="ims-skeleton h-10 w-64" />
            <div className="ims-skeleton h-28 w-full" />
            <div className="ims-skeleton h-64 w-full" />
          </div>
        </Card>
      ) : null}
      {!loading ? (
        <article className="purchase-invoice-document rounded-[1.8rem] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] pb-5">
            <div>
              <p className="text-[0.78rem] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                {companyName}
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[var(--text-strong)]">
                Purchase Invoice
              </h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {txNumber ? `System No ${txNumber}` : "Draft not saved yet"}
              </p>
            </div>
            <div className="min-w-[12rem] text-left sm:text-right">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Status
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--text-strong)]">{status}</p>
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                {createdAt ? `Created ${new Date(createdAt).toLocaleString()}` : "Not posted yet"}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="rounded-[1.4rem] border border-[var(--line)] bg-[var(--surface-muted)] p-4 sm:p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    Warehouse
                  </span>
                  <div className="ims-control-lg flex items-center rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] px-4 text-sm text-[var(--text-strong)]">
                    {MAIN_WAREHOUSE_NAME}
                  </div>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    Voucher Date
                  </span>
                  <Input
                    type="date"
                    className="ims-control-lg"
                    value={supplierInvoiceDate}
                    onChange={(event) => setSupplierInvoiceDate(event.target.value)}
                    disabled={!canEdit}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    Supplier
                  </span>
                  <Select
                    className="ims-control-lg"
                    value={supplierId}
                    onChange={(event) => setSupplierId(event.target.value)}
                    disabled={!canEdit}
                  >
                    <option value="">Select supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.code ? `${supplier.code} - ${supplier.name}` : supplier.name}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    Voucher No
                  </span>
                  <Input
                    className="ims-control-lg"
                    value={supplierInvoiceNumber}
                    onChange={(event) => setSupplierInvoiceNumber(event.target.value)}
                    placeholder="Supplier invoice number"
                    disabled={!canEdit}
                  />
                </label>
              </div>
            </div>
            <div className="rounded-[1.4rem] border border-[var(--line)] bg-[var(--surface-muted)] p-4 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Summary
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                  <p className="text-xs text-[var(--text-muted)]">Supplier</p>
                  <p className="mt-1 font-medium text-[var(--text-strong)]">{supplierName}</p>
                </div>
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                  <p className="text-xs text-[var(--text-muted)]">Items / Qty</p>
                  <p className="mt-1 font-medium text-[var(--text-strong)]">{lines.length} / {totalQty}</p>
                </div>
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                  <p className="text-xs text-[var(--text-muted)]">Net Amount</p>
                  <p className="mt-1 text-lg font-semibold text-[var(--text-strong)]">
                    {formatMoney(netAmount)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="purchase-invoice-editor mt-6 rounded-[1.4rem] border border-[var(--line)] bg-[var(--surface-muted)] p-4 sm:p-5">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_7rem_8rem_auto]">
              <Input
                className="ims-control-lg"
                placeholder="Barcode / SKU"
                value={pendingLine.quickCode}
                onChange={(event) => setPendingLine((current) => ({ ...current, quickCode: event.target.value }))}
                disabled={!canEdit}
              />
              <Select
                className="ims-control-lg"
                value={pendingLine.productId}
                onChange={(event) => setPendingLine((current) => ({ ...current, productId: event.target.value }))}
                disabled={!canEdit}
              >
                <option value="">Select item</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {(product.sku ?? "SKU")} - {product.name}
                  </option>
                ))}
              </Select>
              <Input
                className="ims-control-lg"
                type="number"
                min={1}
                placeholder="Qty"
                value={pendingLine.qty}
                onChange={(event) => setPendingLine((current) => ({ ...current, qty: event.target.value }))}
                disabled={!canEdit}
              />
              <Input
                className="ims-control-lg"
                type="number"
                min={0}
                step="0.01"
                placeholder="Cost"
                value={pendingLine.unitCost}
                onChange={(event) => setPendingLine((current) => ({ ...current, unitCost: event.target.value }))}
                disabled={!canEdit}
              />
              <Button type="button" className="ims-control-lg rounded-2xl" onClick={addPendingLine} disabled={!canEdit}>
                Add Item
              </Button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Input
                className="ims-control-lg"
                placeholder="Lot number"
                value={pendingLine.lotNumber}
                onChange={(event) => setPendingLine((current) => ({ ...current, lotNumber: event.target.value }))}
                disabled={!canEdit}
              />
              <Input
                className="ims-control-lg"
                type="date"
                value={pendingLine.expiryDate}
                onChange={(event) => setPendingLine((current) => ({ ...current, expiryDate: event.target.value }))}
                disabled={!canEdit}
              />
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-[1.4rem] border border-[var(--line)]">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">LN</th>
                  <th className="px-4 py-3 font-semibold">Barcode</th>
                  <th className="px-4 py-3 font-semibold">Item Name</th>
                  <th className="px-4 py-3 text-right font-semibold">Qty</th>
                  <th className="px-4 py-3 text-right font-semibold">Cost Price</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th className="purchase-invoice-delete-column px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr className="border-t border-[var(--line)]">
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)]">
                      Add invoice items to build the purchase draft.
                    </td>
                  </tr>
                ) : (
                  lines.map((line, index) => {
                    const product = productById.get(line.productId);
                    return (
                      <tr key={line.clientId} className="border-t border-[var(--line)] align-top">
                        <td className="px-4 py-3 text-[var(--text-muted)]">{index + 1}</td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">{product?.barcode ?? "--"}</td>
                        <td className="px-4 py-3"><PurchaseLineProductDisplay product={product} line={line} /></td>
                        <td className="px-4 py-3 text-right">
                          <Input className="ims-control-md ml-auto w-24 text-right" type="number" min={1} value={line.qty} onChange={(event) => updateLine(line.clientId, "qty", event.target.value)} disabled={!canEdit} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Input className="ims-control-md ml-auto w-28 text-right" type="number" min={0} step="0.01" value={line.unitCost} onChange={(event) => updateLine(line.clientId, "unitCost", event.target.value)} disabled={!canEdit} />
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-[var(--text-strong)]">{formatMoney(buildLineTotal(line))}</td>
                        <td className="purchase-invoice-delete-column px-4 py-3 text-right">
                          {canEdit ? (
                            <Button type="button" variant="ghost" className="ims-control-md rounded-xl text-rose-300 hover:text-rose-200" onClick={() => removeLine(line.clientId)}>
                              Delete
                            </Button>
                          ) : (
                            <span className="text-[var(--text-muted)]">--</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="rounded-[1.4rem] border border-[var(--line)] bg-[var(--surface-muted)] p-4 sm:p-5">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Notes</span>
                <textarea
                  className="min-h-32 w-full rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-strong)] outline-none transition focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/30"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Additional invoice notes"
                  disabled={!canEdit}
                />
              </label>
            </div>
            <div className="rounded-[1.4rem] border border-[var(--line)] bg-[var(--surface-muted)] p-4 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Totals</p>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3"><span className="text-sm text-[var(--text-muted)]">Line Count</span><span className="font-medium text-[var(--text-strong)]">{lines.length}</span></div>
                <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3"><span className="text-sm text-[var(--text-muted)]">Total Qty</span><span className="font-medium text-[var(--text-strong)]">{totalQty}</span></div>
                <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3"><span className="text-sm text-[var(--text-muted)]">Net Amount</span><span className="text-lg font-semibold text-[var(--text-strong)]">{formatMoney(netAmount)}</span></div>
              </div>
            </div>
          </div>

          <div className="purchase-invoice-actions mt-6 flex flex-wrap justify-end gap-2 border-t border-[var(--line)] pt-5">
            {canEdit ? (
              <Button type="button" className="ims-control-lg rounded-2xl" onClick={saveInvoice} disabled={saving || actionLoading}>
                {saving ? "Saving..." : transactionId ? "Update Draft" : "Save Draft"}
              </Button>
            ) : null}
            {transactionId && status === "DRAFT" ? (
              <Button type="button" variant="secondary" className="ims-control-lg rounded-2xl" onClick={() => runStatusAction("submit")} disabled={saving || actionLoading}>
                {actionLoading ? "Submitting..." : "Submit"}
              </Button>
            ) : null}
            {transactionId && status === "SUBMITTED" ? (
              <Button type="button" variant="secondary" className="ims-control-lg rounded-2xl" onClick={() => runStatusAction("post")} disabled={saving || actionLoading}>
                {actionLoading ? "Posting..." : "Post"}
              </Button>
            ) : null}
            {transactionId && status === "DRAFT" ? (
              <Button type="button" variant="ghost" className="ims-control-lg rounded-2xl text-rose-300 hover:text-rose-200" onClick={deleteInvoice} disabled={saving || actionLoading}>
                Delete
              </Button>
            ) : null}
            <Button type="button" variant="secondary" className="ims-control-lg rounded-2xl" onClick={() => window.print()}>
              Print
            </Button>
            <Link href={backHref} className="inline-flex ims-control-lg items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 text-[var(--text-strong)] transition hover:bg-[var(--surface-muted)]">
              Cancel
            </Link>
          </div>
        </article>
      ) : null}
    </div>
  );
}
