import { getAuthContext } from "@/lib/auth/permissions";
import {
  buildBatchStockAsOfDate,
  parseAsOfDate,
  summarizeStockForExport,
} from "@/lib/stock/snapshot";
import type { BatchMetadataRow, LedgerMovementRow } from "@/lib/stock/snapshot";
import { toCsv } from "@/lib/utils/csv";
import { fail } from "@/lib/utils/http";

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const url = new URL(request.url);
  const entity = url.searchParams.get("entity");
  const includeInactive = url.searchParams.get("include_inactive") === "true";

  if (!entity || !["products", "stock", "transactions"].includes(entity)) {
    return fail("Invalid export entity. Use products, stock, or transactions.", 422);
  }

  const isAdmin = context.profile.role === "admin";
  const noLocationAccess = !isAdmin && context.locationIds.length === 0;

  let rows: Record<string, unknown>[] = [];

  if (entity === "products") {
    let query = context.supabase
      .from("products")
      .select("id, sku, barcode, name, unit, is_active, created_at")
      .order("name", { ascending: true });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;

    if (error) {
      return fail(error.message, 400);
    }

    rows = (data ?? []) as Record<string, unknown>[];
  }

  if (entity === "stock") {
    if (noLocationAccess) {
      rows = [];
    } else {
      const asOfDate = url.searchParams.get("as_of_date");
      const parsedAsOfDate = parseAsOfDate(asOfDate);
      if (parsedAsOfDate.error) {
        return fail(parsedAsOfDate.error, 422);
      }

      if (parsedAsOfDate.cutoffExclusiveIso) {
        let ledgerQuery = context.supabase
          .from("stock_ledger")
          .select("batch_id, product_id, location_id, direction, qty")
          .lt("occurred_at", parsedAsOfDate.cutoffExclusiveIso);

        if (!isAdmin) {
          ledgerQuery = ledgerQuery.in("location_id", context.locationIds);
        }

        const { data: ledgerData, error: ledgerError } = await ledgerQuery;
        if (ledgerError) {
          return fail(ledgerError.message, 400);
        }

        const ledgerRows = (ledgerData ?? []) as LedgerMovementRow[];
        if (ledgerRows.length === 0) {
          rows = [];
        } else {
          const batchIds = Array.from(new Set(ledgerRows.map((row) => row.batch_id)));
          let batchQuery = context.supabase
            .from("inventory_batches")
            .select(
              "id, product_id, location_id, lot_number, expiry_date, received_at, unit_cost, products(name, sku), locations(name, code)",
            )
            .in("id", batchIds);

          if (!isAdmin) {
            batchQuery = batchQuery.in("location_id", context.locationIds);
          }

          const { data: batchData, error: batchError } = await batchQuery;
          if (batchError) {
            return fail(batchError.message, 400);
          }

          const snapshotRows = buildBatchStockAsOfDate(
            ledgerRows,
            (batchData ?? []) as BatchMetadataRow[],
          );
          rows = summarizeStockForExport(snapshotRows) as Record<string, unknown>[];
        }
      } else {
        let query = context.supabase
          .from("v_stock_snapshot")
          .select("*")
          .order("location_name", { ascending: true });

        if (!isAdmin) {
          query = query.in("location_id", context.locationIds);
        }

        const { data, error } = await query;
        if (error) {
          return fail(error.message, 400);
        }

        rows = (data ?? []) as Record<string, unknown>[];
      }
    }
  }

  if (entity === "transactions") {
    if (noLocationAccess) {
      rows = [];
    } else {
      let query = context.supabase
        .from("inventory_transactions")
        .select(
          "id, tx_number, type, status, source_location_id, destination_location_id, created_at, posted_at",
        )
        .order("created_at", { ascending: false })
        .limit(1000);

      if (!isAdmin) {
        const locFilter = context.locationIds.join(",");
        query = query.or(
          `source_location_id.in.(${locFilter}),destination_location_id.in.(${locFilter})`,
        );
      }

      const { data, error } = await query;
      if (error) {
        return fail(error.message, 400);
      }

      rows = (data ?? []) as Record<string, unknown>[];
    }
  }

  const csv = toCsv(rows);
  const filename = `${entity}-export-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
      "Cache-Control": "no-store",
    },
  });
}
