import {
  assertRole,
  getAuthContext,
} from "@/lib/auth/permissions";
import { isMissingSnapshotColumnError } from "@/lib/supabase/snapshot-schema-compat";
import { createInventoryTransaction } from "@/lib/transactions/mutations";
import { transactionCreateSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

const TRANSACTION_SELECT_WITH_SNAPSHOTS =
  "*, inventory_transaction_lines(id, product_id, qty, lot_number, expiry_date, unit_cost, reason_code, product_sku_snapshot, product_name_snapshot, product_barcode_snapshot)";
const TRANSACTION_SELECT_LEGACY =
  "*, inventory_transaction_lines(id, product_id, qty, lot_number, expiry_date, unit_cost, reason_code)";

function parsePositiveInt(raw: string | null, fallback: number) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) {
    return fallback;
  }

  return Math.floor(value);
}

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const url = new URL(request.url);
  const limit = Math.min(parsePositiveInt(url.searchParams.get("limit"), 50), 200);
  const page = parsePositiveInt(url.searchParams.get("page"), 1);
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");
  const offset = (page - 1) * limit;
  const end = offset + limit - 1;

  const buildQuery = (includeSnapshots: boolean) => {
    let query = context.supabase
      .from("inventory_transactions")
      .select(
        includeSnapshots
          ? TRANSACTION_SELECT_WITH_SNAPSHOTS
          : TRANSACTION_SELECT_LEGACY,
      )
      .order("created_at", { ascending: false })
      .range(offset, end);

    if (status) {
      query = query.eq("status", status);
    }
    if (type) {
      query = query.eq("type", type);
    }

    if (context.profile.role !== "admin") {
      const locFilter = context.locationIds.join(",");
      query = query.or(
        `source_location_id.in.(${locFilter}),destination_location_id.in.(${locFilter})`,
      );
    }

    return query;
  };

  if (context.profile.role !== "admin" && context.locationIds.length === 0) {
    return ok({ items: [] });
  }

  let { data, error } = await buildQuery(true);
  if (isMissingSnapshotColumnError(error)) {
    ({ data, error } = await buildQuery(false));
  }

  if (error) {
    return fail(error.message, 400);
  }

  return ok({ items: data ?? [] });
}

export async function POST(request: Request) {
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

  const result = await createInventoryTransaction(context, payload.data);
  if (!result.ok) {
    return fail(result.error, result.status);
  }

  return ok(result.data, result.status);
}
