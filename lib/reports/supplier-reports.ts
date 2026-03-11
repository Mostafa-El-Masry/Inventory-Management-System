import type { AuthContext } from "@/lib/auth/permissions";
import { isMissingSnapshotColumnError } from "@/lib/supabase/snapshot-schema-compat";

export type SupplierReportRow = {
  id: string;
  supplier_id: string;
  supplier_code: string;
  supplier_name: string;
  document_no: string;
  document_type: "INVOICE" | "CREDIT_NOTE";
  document_date: string;
  location_id: string;
  location_code: string;
  location_name: string;
  transaction_id: string | null;
  transaction_number: string | null;
  gross_amount: number;
  paid_amount: number;
  pending_amount: number;
  status: "OPEN" | "VOID";
  can_record_payment: boolean;
};

export type SupplierReportResult = {
  rows: SupplierReportRow[];
  summary: {
    total_invoiced: number;
    total_credits: number;
    total_paid: number;
    net_pending: number;
  };
};

type LocationRelation = {
  id: string;
  code: string;
  name: string;
};

type SupplierRelation = {
  id: string;
  code: string | null;
  name: string | null;
};

type TransactionRelation = {
  id: string;
  tx_number: string;
};

type SupplierDocumentRawRow = {
  id: string;
  supplier_id: string;
  location_id: string;
  source_transaction_id: string | null;
  document_type: "INVOICE" | "CREDIT_NOTE";
  document_number: string;
  document_date: string;
  gross_amount: number | string;
  status: "OPEN" | "VOID";
  supplier_code_snapshot: string | null;
  supplier_name_snapshot: string | null;
  supplier?: SupplierRelation | SupplierRelation[] | null;
  location?: LocationRelation | LocationRelation[] | null;
  transaction?: TransactionRelation | TransactionRelation[] | null;
};

const SUPPLIER_DOCUMENT_SELECT_WITH_SNAPSHOTS = `
        id,
        supplier_id,
        location_id,
        source_transaction_id,
        document_type,
        document_number,
        document_date,
        gross_amount,
        status,
        supplier_code_snapshot,
        supplier_name_snapshot,
        supplier:suppliers(id, code, name),
        location:locations(id, code, name),
        transaction:inventory_transactions!supplier_documents_source_transaction_id_fkey(id, tx_number)
      `;

const SUPPLIER_DOCUMENT_SELECT_LEGACY = `
        id,
        supplier_id,
        location_id,
        source_transaction_id,
        document_type,
        document_number,
        document_date,
        gross_amount,
        status,
        supplier:suppliers(id, code, name),
        location:locations(id, code, name),
        transaction:inventory_transactions!supplier_documents_source_transaction_id_fkey(id, tx_number)
      `;

type SupplierPaymentRow = {
  supplier_document_id: string;
  amount: number | string;
};

function parseDateOrNull(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return date;
}

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function buildSupplierReport(
  context: AuthContext,
  params: {
    fromDate: string;
    toDate: string;
    supplierId: string | null;
    statusFilter: "OPEN" | "VOID" | null;
  },
): Promise<{ error: string } | SupplierReportResult> {
  const fromDate = parseDateOrNull(params.fromDate);
  const toDate = parseDateOrNull(params.toDate);
  if (!fromDate || !toDate) {
    return { error: "Invalid date range. Use YYYY-MM-DD." };
  }
  if (fromDate.getTime() > toDate.getTime()) {
    return { error: "Invalid date range. from_date must be before or equal to to_date." };
  }

  if (context.profile.role !== "admin" && context.locationIds.length === 0) {
    return {
      rows: [],
      summary: {
        total_invoiced: 0,
        total_credits: 0,
        total_paid: 0,
        net_pending: 0,
      },
    };
  }

  const buildQuery = (includeSnapshots: boolean) => {
    let query = context.supabase
      .from("supplier_documents")
      .select(
        includeSnapshots
          ? SUPPLIER_DOCUMENT_SELECT_WITH_SNAPSHOTS
          : SUPPLIER_DOCUMENT_SELECT_LEGACY,
      )
      .gte("document_date", params.fromDate)
      .lte("document_date", params.toDate)
      .order("document_date", { ascending: false })
      .limit(5000);

    if (params.supplierId) {
      query = query.eq("supplier_id", params.supplierId);
    }
    if (params.statusFilter) {
      query = query.eq("status", params.statusFilter);
    }
    if (context.profile.role !== "admin") {
      query = query.in("location_id", context.locationIds);
    }

    return query;
  };

  let { data, error } = await buildQuery(true);
  if (error) {
    const legacyResult = await buildQuery(false);
    if (!legacyResult.error) {
      ({ data, error } = legacyResult);
    } else if (isMissingSnapshotColumnError(error)) {
      ({ data, error } = legacyResult);
    }
  }

  if (error) {
    return { error: error.message };
  }

  const documents = (data ?? []) as unknown as SupplierDocumentRawRow[];
  if (documents.length === 0) {
    return {
      rows: [],
      summary: {
        total_invoiced: 0,
        total_credits: 0,
        total_paid: 0,
        net_pending: 0,
      },
    };
  }

  const documentIds = documents.map((document) => document.id);
  const { data: paymentData, error: paymentError } = await context.supabase
    .from("supplier_document_payments")
    .select("supplier_document_id, amount")
    .in("supplier_document_id", documentIds);
  if (paymentError) {
    return { error: paymentError.message };
  }

  const paidByDocumentId = new Map<string, number>();
  for (const payment of (paymentData ?? []) as SupplierPaymentRow[]) {
    const current = paidByDocumentId.get(payment.supplier_document_id) ?? 0;
    paidByDocumentId.set(payment.supplier_document_id, current + toNumber(payment.amount));
  }

  let totalInvoiced = 0;
  let totalCredits = 0;
  let totalPaid = 0;

  const rows: SupplierReportRow[] = documents.map((document) => {
    const supplier = normalizeRelation(document.supplier);
    const location = normalizeRelation(document.location);
    const transaction = normalizeRelation(document.transaction);
    const grossAmount = toNumber(document.gross_amount);
    const paidAmount = paidByDocumentId.get(document.id) ?? 0;

    const pendingAmount =
      document.status === "VOID"
        ? 0
        : document.document_type === "INVOICE"
          ? Math.max(grossAmount - paidAmount, 0)
          : -grossAmount;

    if (document.status !== "VOID") {
      if (document.document_type === "INVOICE") {
        totalInvoiced += grossAmount;
        totalPaid += paidAmount;
      } else {
        totalCredits += grossAmount;
      }
    }

    return {
      id: document.id,
      supplier_id: document.supplier_id,
      supplier_code:
        document.supplier_code_snapshot ?? supplier?.code ?? document.supplier_id,
      supplier_name:
        document.supplier_name_snapshot ?? supplier?.name ?? document.supplier_id,
      document_no: document.document_number,
      document_type: document.document_type,
      document_date: document.document_date,
      location_id: document.location_id,
      location_code: location?.code ?? document.location_id,
      location_name: location?.name ?? document.location_id,
      transaction_id: document.source_transaction_id,
      transaction_number: transaction?.tx_number ?? null,
      gross_amount: grossAmount,
      paid_amount: paidAmount,
      pending_amount: pendingAmount,
      status: document.status,
      can_record_payment:
        context.capabilities.canRecordSupplierPayments &&
        document.document_type === "INVOICE" &&
        document.status === "OPEN" &&
        pendingAmount > 0,
    };
  });

  return {
    rows,
    summary: {
      total_invoiced: totalInvoiced,
      total_credits: totalCredits,
      total_paid: totalPaid,
      net_pending: totalInvoiced - totalCredits - totalPaid,
    },
  };
}
