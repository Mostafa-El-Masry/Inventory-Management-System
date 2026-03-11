import { assertRole, getAuthContext } from "@/lib/auth/permissions";
import { isMissingSnapshotColumnError } from "@/lib/supabase/snapshot-schema-compat";
import {
  deleteInventoryTransaction,
  updateInventoryTransaction,
} from "@/lib/transactions/mutations";
import type {
  TransactionDetailRecord,
  TransactionDetailResponse,
  TransactionLineDetail,
  TransactionLookupSummary,
} from "@/lib/types/api";
import { fail, ok, parseBody } from "@/lib/utils/http";
import { transactionCreateSchema } from "@/lib/validation";

type RawTransactionLine = {
  id: string;
  product_id: string;
  product_sku_snapshot?: string | null;
  product_name_snapshot?: string | null;
  product_barcode_snapshot?: string | null;
  qty: number;
  lot_number: string | null;
  expiry_date: string | null;
  unit_cost: number | null;
  reason_code: string | null;
};

type RawTransactionRecord = {
  id: string;
  tx_number: string;
  type: string;
  status: string;
  source_location_id: string | null;
  destination_location_id: string | null;
  supplier_id: string | null;
  supplier_code_snapshot?: string | null;
  supplier_name_snapshot?: string | null;
  supplier_invoice_number: string | null;
  supplier_invoice_date: string | null;
  notes: string | null;
  created_at: string;
  inventory_transaction_lines?: RawTransactionLine[] | null;
};

type LocationRow = {
  id: string;
  code: string | null;
  name: string | null;
};

type SupplierRow = {
  id: string;
  code: string | null;
  name: string | null;
};

type ProductRow = {
  id: string;
  sku: string | null;
  name: string | null;
  barcode: string | null;
};

const TRANSACTION_DETAIL_SELECT_WITH_SNAPSHOTS =
  "id, tx_number, type, status, source_location_id, destination_location_id, supplier_id, supplier_code_snapshot, supplier_name_snapshot, supplier_invoice_number, supplier_invoice_date, notes, created_at, inventory_transaction_lines(id, product_id, qty, lot_number, expiry_date, unit_cost, reason_code, product_sku_snapshot, product_name_snapshot, product_barcode_snapshot)";
const TRANSACTION_DETAIL_SELECT_LEGACY =
  "id, tx_number, type, status, source_location_id, destination_location_id, supplier_id, supplier_invoice_number, supplier_invoice_date, notes, created_at, inventory_transaction_lines(id, product_id, qty, lot_number, expiry_date, unit_cost, reason_code)";

function normalizeDisplayValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function buildLookupSummary(
  row?: { id: string; code: string | null; name: string | null } | null,
): TransactionLookupSummary | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    code: normalizeDisplayValue(row.code),
    name: normalizeDisplayValue(row.name),
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const { id } = await params;

  const buildQuery = (includeSnapshots: boolean) =>
    context.supabase
      .from("inventory_transactions")
      .select(
        includeSnapshots
          ? TRANSACTION_DETAIL_SELECT_WITH_SNAPSHOTS
          : TRANSACTION_DETAIL_SELECT_LEGACY,
      )
      .eq("id", id)
      .maybeSingle<RawTransactionRecord>();

  let { data: transaction, error } = await buildQuery(true);
  if (isMissingSnapshotColumnError(error)) {
    ({ data: transaction, error } = await buildQuery(false));
  }

  if (error) {
    return fail(error.message, 400);
  }

  if (!transaction) {
    return fail("Transaction not found.", 404);
  }

  const accessibleLocationIds = [
    transaction.source_location_id,
    transaction.destination_location_id,
  ].filter((value): value is string => Boolean(value));

  if (
    context.profile.role !== "admin" &&
    !accessibleLocationIds.some((locationId) =>
      context.locationIds.includes(locationId),
    )
  ) {
    return fail("No access to this transaction.", 403);
  }

  const locationIds = Array.from(new Set(accessibleLocationIds));
  const productIds = Array.from(
    new Set(
      (transaction.inventory_transaction_lines ?? []).map((line) => line.product_id),
    ),
  );

  const [locationResult, productResult, supplierResult] = await Promise.all([
    locationIds.length > 0
      ? context.supabase
          .from("locations")
          .select("id, code, name")
          .in("id", locationIds)
      : Promise.resolve({ data: [], error: null }),
    productIds.length > 0
      ? context.supabase
          .from("products")
          .select("id, sku, name, barcode")
          .in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
    transaction.supplier_id
      ? context.supabase
          .from("suppliers")
          .select("id, code, name")
          .eq("id", transaction.supplier_id)
          .maybeSingle<SupplierRow>()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (locationResult.error) {
    return fail(locationResult.error.message, 400);
  }

  if (productResult.error) {
    return fail(productResult.error.message, 400);
  }

  if (supplierResult.error) {
    return fail(supplierResult.error.message, 400);
  }

  const locationById = new Map(
    ((locationResult.data ?? []) as LocationRow[]).map((location) => [
      location.id,
      location,
    ]),
  );
  const productById = new Map(
    ((productResult.data ?? []) as ProductRow[]).map((product) => [product.id, product]),
  );

  const lines: TransactionLineDetail[] = (transaction.inventory_transaction_lines ?? []).map(
    (line) => {
      const product = productById.get(line.product_id);
      const unitCost = line.unit_cost == null ? null : Number(line.unit_cost);
      const qty = Number(line.qty ?? 0);

      return {
        id: line.id,
        product_id: line.product_id,
        product_display_code:
          normalizeDisplayValue(line.product_sku_snapshot) ??
          normalizeDisplayValue(product?.sku) ??
          null,
        product_display_name:
          normalizeDisplayValue(line.product_name_snapshot) ??
          normalizeDisplayValue(product?.name) ??
          null,
        product_barcode:
          normalizeDisplayValue(line.product_barcode_snapshot) ??
          normalizeDisplayValue(product?.barcode) ??
          null,
        qty,
        lot_number: normalizeDisplayValue(line.lot_number),
        expiry_date: normalizeDisplayValue(line.expiry_date),
        unit_cost: unitCost,
        reason_code: normalizeDisplayValue(line.reason_code),
        line_total: unitCost == null ? null : Number((qty * unitCost).toFixed(2)),
      };
    },
  );

  const item: TransactionDetailRecord = {
    id: transaction.id,
    tx_number: transaction.tx_number,
    type: transaction.type,
    status: transaction.status,
    created_at: transaction.created_at,
    notes: normalizeDisplayValue(transaction.notes),
    supplier_invoice_number: normalizeDisplayValue(transaction.supplier_invoice_number),
    supplier_invoice_date: normalizeDisplayValue(transaction.supplier_invoice_date),
    source_location: buildLookupSummary(
      transaction.source_location_id
        ? locationById.get(transaction.source_location_id) ?? null
        : null,
    ),
    destination_location: buildLookupSummary(
      transaction.destination_location_id
        ? locationById.get(transaction.destination_location_id) ?? null
        : null,
    ),
    supplier: transaction.supplier_id
      ? {
          id: transaction.supplier_id,
          code:
            normalizeDisplayValue(transaction.supplier_code_snapshot) ??
            normalizeDisplayValue(supplierResult.data?.code) ??
            null,
          name:
            normalizeDisplayValue(transaction.supplier_name_snapshot) ??
            normalizeDisplayValue(supplierResult.data?.name) ??
            null,
        }
      : null,
    lines,
    total_qty: lines.reduce((total, line) => total + line.qty, 0),
    total_cost: Number(
      lines
        .reduce((total, line) => total + Number(line.line_total ?? 0), 0)
        .toFixed(2),
    ),
  };

  return ok<TransactionDetailResponse>({ item });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const roleError = assertRole(context, ["admin", "manager", "staff"]);
  if (roleError) {
    return roleError;
  }

  const payload = await parseBody(request, transactionCreateSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const { id } = await params;
  const result = await updateInventoryTransaction(context, id, payload.data);
  if (!result.ok) {
    return fail(result.error, result.status);
  }

  return ok(result.data, result.status);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const roleError = assertRole(context, ["admin", "manager", "staff"]);
  if (roleError) {
    return roleError;
  }

  const { id } = await params;
  const result = await deleteInventoryTransaction(context, id);
  if (!result.ok) {
    return fail(result.error, result.status);
  }

  return ok(result.data, result.status);
}
