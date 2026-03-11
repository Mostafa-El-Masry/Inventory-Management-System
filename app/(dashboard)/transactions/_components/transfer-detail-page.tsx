"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useDashboardSession } from "@/components/layout/dashboard-session-provider";
import { Card } from "@/components/ui/card";
import type { TransferDetailResponse, TransferLineDetail } from "@/lib/types/api";
import { fetchJson } from "@/lib/utils/fetch-json";

const DIRECT_NOTE_PREFIX = "[DIRECT]";

function formatLineProduct(line: TransferLineDetail) {
  const code = line.product_display_code?.trim() || "SKU";
  const name = line.product_display_name?.trim();
  return name ? `${code} - ${name}` : code;
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

export function TransferDetailPage({
  transferId,
}: {
  transferId: string;
}) {
  const { companyName } = useDashboardSession();
  const [data, setData] = useState<TransferDetailResponse["item"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTransfer() {
      setLoading(true);
      setError(null);

      const result = await fetchJson<TransferDetailResponse>(`/api/transfers/${transferId}`, {
        signal: controller.signal,
        fallbackError: "Failed to load transfer details.",
      });

      if (!result.ok) {
        if (result.error !== "Request aborted.") {
          setError(result.error);
        }
        setLoading(false);
        return;
      }

      setData(result.data.item);
      setLoading(false);
    }

    void loadTransfer();

    return () => controller.abort();
  }, [transferId]);

  const isDirectTransfer = useMemo(
    () => Boolean(data && (data.notes ?? "").startsWith(DIRECT_NOTE_PREFIX)),
    [data],
  );
  const cleanNotes = useMemo(() => {
    if (!data?.notes) {
      return null;
    }

    if (!isDirectTransfer) {
      return data.notes;
    }

    return data.notes.replace(DIRECT_NOTE_PREFIX, "").trim() || null;
  }, [data, isDirectTransfer]);

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
          <p className="ims-kicker">Transfers</p>
          <h1 className="ims-title">Transfer Details</h1>
          <p className="ims-subtitle">
            Open the full transfer document, review all line items, and print it on A4.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/transactions/transfers"
            className="inline-flex ims-control-md items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 text-[var(--text-strong)] transition hover:bg-[var(--surface-muted)]"
          >
            Back to Transfers
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
                {isDirectTransfer ? "Direct Transfer" : "Material Transfer"}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Transfer {data.transfer_number}
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
              label="From Branch"
              value={
                data.source_location?.name
                  ? `${data.source_location.code ?? "LOC"} - ${data.source_location.name}`
                  : "--"
              }
            />
            <DetailField
              label="To Branch"
              value={
                data.destination_location?.name
                  ? `${data.destination_location.code ?? "LOC"} - ${data.destination_location.name}`
                  : "--"
              }
            />
            <DetailField
              label="Items"
              value={String(data.lines.length)}
            />
            <DetailField
              label="Flow"
              value={isDirectTransfer ? "Direct Transfer" : "Material Request / Transfer"}
            />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <DetailField label="Requested Qty" value={String(data.total_requested_qty)} />
            <DetailField label="Dispatched Qty" value={String(data.total_dispatched_qty)} />
            <DetailField label="Received Qty" value={String(data.total_received_qty)} />
          </div>

          {cleanNotes ? (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Notes
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{cleanNotes}</p>
            </div>
          ) : null}

          <div className="mt-6 overflow-x-auto rounded-[1.5rem] border border-slate-200">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">Barcode</th>
                  <th className="px-4 py-3 text-right font-semibold">Requested</th>
                  <th className="px-4 py-3 text-right font-semibold">Dispatched</th>
                  <th className="px-4 py-3 text-right font-semibold">Received</th>
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
                    <td className="px-4 py-3 text-right text-slate-900">
                      {line.requested_qty}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-900">
                      {line.dispatched_qty}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-950">
                      {line.received_qty}
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
