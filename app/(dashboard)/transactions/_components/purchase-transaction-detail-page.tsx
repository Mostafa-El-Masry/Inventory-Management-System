"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { useDashboardSession } from "@/components/layout/dashboard-session-provider";
import { formatSystemCurrency } from "@/lib/settings/system-currency";
import type { TransactionDetailResponse, TransactionLineDetail } from "@/lib/types/api";
import { fetchJson } from "@/lib/utils/fetch-json";

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatLineProduct(line: TransactionLineDetail) {
  const code = line.product_display_code?.trim() || "SKU";
  const name = line.product_display_name?.trim();
  return name ? `${code} - ${name}` : code;
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

export function PurchaseTransactionDetailPage({
  transactionId,
  backHref,
  backLabel,
  allowedTypes,
  adjustmentMode,
}: {
  transactionId: string;
  backHref: string;
  backLabel: string;
  allowedTypes: string[];
  adjustmentMode?: "opening" | "adjustment";
}) {
  const { companyName, currencyCode } = useDashboardSession();
  const [data, setData] = useState<TransactionDetailResponse["item"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const formatMoney = useCallback(
    (value: number | null | undefined) => formatSystemCurrency(value, currencyCode),
    [currencyCode],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadTransaction() {
      setLoading(true);
      setError(null);

      const result = await fetchJson<TransactionDetailResponse>(
        `/api/transactions/${transactionId}`,
        {
          signal: controller.signal,
          fallbackError: "Failed to load transaction details.",
        },
      );

      if (!result.ok) {
        if (result.error !== "Request aborted.") {
          setError(result.error);
        }
        setLoading(false);
        return;
      }

      const item = result.data.item;
      const itemFirstReason = item.lines[0]?.reason_code ?? null;
      const itemIsOpening = item.type === "ADJUSTMENT" && itemFirstReason === "OPENING";

      if (!allowedTypes.includes(item.type)) {
        setData(null);
        setError("This transaction cannot be opened from this page.");
        setLoading(false);
        return;
      }

      if (
        adjustmentMode === "opening" &&
        item.type === "ADJUSTMENT" &&
        !itemIsOpening
      ) {
        setData(null);
        setError("Only opening stock entries can be opened from this page.");
        setLoading(false);
        return;
      }

      if (
        adjustmentMode === "adjustment" &&
        item.type === "ADJUSTMENT" &&
        itemIsOpening
      ) {
        setData(null);
        setError("Only stock adjustment entries can be opened from this page.");
        setLoading(false);
        return;
      }

      setData(item);
      setLoading(false);
    }

    void loadTransaction();

    return () => controller.abort();
  }, [adjustmentMode, allowedTypes, transactionId]);

  const lineCount = data?.lines.length ?? 0;
  const totalQty = useMemo(
    () => data?.lines.reduce((total, line) => total + line.qty, 0) ?? 0,
    [data],
  );
  const firstReason = data?.lines[0]?.reason_code ?? null;
  const isOpening = data?.type === "ADJUSTMENT" && firstReason === "OPENING";
  const isDecrease = data?.type === "ADJUSTMENT" && firstReason === "DECREASE";
  const pageTitle =
    data?.type === "RETURN_OUT"
      ? "Purchase Return Details"
      : data?.type === "ADJUSTMENT"
        ? isOpening
          ? "Opening Stock Details"
          : "Stock Adjustment Details"
        : "Purchase Details";
  const documentTitle =
    data?.type === "RETURN_OUT"
      ? "Purchase Return"
      : data?.type === "ADJUSTMENT"
        ? isOpening
          ? "Opening Stock Entry"
          : "Stock Adjustment"
        : "Purchase Receipt";
  const locationLabel =
    data?.type === "RETURN_OUT"
      ? "Source Branch"
      : data?.type === "ADJUSTMENT"
        ? "Branch"
        : "Destination Branch";
  const locationValue =
    data?.type === "RETURN_OUT"
      ? data?.source_location
      : data?.type === "ADJUSTMENT"
        ? data?.destination_location ?? data?.source_location
        : data?.destination_location;
  const secondaryFieldLabel =
    data?.type === "ADJUSTMENT" ? "Direction" : "Invoice Number";
  const secondaryFieldValue =
    data?.type === "ADJUSTMENT"
      ? isOpening
        ? "Opening Stock"
        : isDecrease
          ? "Remove Stock"
          : "Add Stock"
      : data?.supplier_invoice_number ?? "--";
  const tertiaryFieldLabel =
    data?.type === "ADJUSTMENT" ? "Reference Date" : "Invoice Date";
  const tertiaryFieldValue =
    data?.type === "ADJUSTMENT"
      ? formatDate(data?.created_at)
      : formatDate(data?.supplier_invoice_date);

  return (
    <div className="purchase-print-page space-y-5">
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

          .purchase-print-page,
          .purchase-print-page * {
            visibility: visible !important;
          }

          .purchase-print-page {
            position: absolute !important;
            inset: 0 !important;
            z-index: 9999 !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }

          .purchase-print-toolbar {
            display: none !important;
          }

          .purchase-a4-document {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .purchase-a4-document table {
            width: 100% !important;
          }

          .purchase-a4-document thead {
            display: table-header-group;
          }

          .purchase-a4-document tr,
          .purchase-a4-document td,
          .purchase-a4-document th {
            break-inside: avoid;
          }
        }
      `}</style>

      <header className="purchase-print-toolbar flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="ims-kicker">Transactions</p>
          <h1 className="ims-title">{pageTitle}</h1>
          <p className="ims-subtitle">
            Open the full document, review all line items, and print the document on A4.
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
            disabled={!data || loading}
            className="inline-flex ims-control-md items-center justify-center rounded-full border border-transparent bg-[var(--brand-primary)] px-4 font-medium text-[var(--text-strong)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Print A4
          </button>
        </div>
      </header>

      {error ? <p className="ims-alert-danger">{error}</p> : null}

      {loading ? (
        <Card className="min-h-[18rem]">
          <p className="ims-kicker">Loading</p>
          <div className="mt-4 space-y-3">
            <div className="ims-skeleton h-8 w-52" />
            <div className="ims-skeleton h-24 w-full" />
            <div className="ims-skeleton h-48 w-full" />
          </div>
        </Card>
      ) : null}

      {data ? (
        <article className="purchase-a4-document mx-auto w-full max-w-[210mm] rounded-[1.75rem] border border-slate-200 bg-white p-6 text-slate-900 shadow-[0_24px_72px_rgba(15,23,42,0.18)] sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
            <div>
              <p className="text-[0.78rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                {companyName}
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
                {documentTitle}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Transaction {data.tx_number}
              </p>
            </div>
            <div className="min-w-[12rem] text-left sm:text-right">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Status
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{data.status}</p>
              <p className="mt-3 text-sm text-slate-600">
                Created {formatDateTime(data.created_at)}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <DetailField
              label={data.type === "ADJUSTMENT" ? "Reference" : "Supplier"}
              value={
                data.type === "ADJUSTMENT"
                  ? "Inventory Transaction"
                  : data.supplier?.name
                  ? `${data.supplier.code ?? "SUP"} - ${data.supplier.name}`
                  : "--"
              }
            />
            <DetailField
              label={locationLabel}
              value={
                locationValue?.name
                  ? `${locationValue.code ?? "LOC"} - ${locationValue.name}`
                  : "--"
              }
            />
            <DetailField
              label={secondaryFieldLabel}
              value={secondaryFieldValue}
            />
            <DetailField
              label={tertiaryFieldLabel}
              value={tertiaryFieldValue}
            />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <DetailField label="Items" value={String(lineCount)} />
            <DetailField label="Total Quantity" value={String(totalQty)} />
            <DetailField label="Document Total" value={formatMoney(data.total_cost)} />
          </div>

          {data.notes ? (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Notes
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{data.notes}</p>
            </div>
          ) : null}

          <div className="mt-6 overflow-x-auto rounded-[1.5rem] border border-slate-200">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">Barcode</th>
                  <th className="px-4 py-3 font-semibold">Lot</th>
                  <th className="px-4 py-3 font-semibold">Expiry</th>
                  <th className="px-4 py-3 text-right font-semibold">Qty</th>
                  <th className="px-4 py-3 text-right font-semibold">Unit Cost</th>
                  <th className="px-4 py-3 text-right font-semibold">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((line) => (
                  <tr key={line.id} className="border-t border-slate-200 align-top">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {formatLineProduct(line)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {line.product_barcode ?? "--"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{line.lot_number ?? "--"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(line.expiry_date)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-900">{line.qty}</td>
                    <td className="px-4 py-3 text-right text-slate-900">
                      {formatMoney(line.unit_cost)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-950">
                      {formatMoney(line.line_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
    </div>
  );
}
