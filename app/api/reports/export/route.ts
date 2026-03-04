import { getAuthContext } from "@/lib/auth/permissions";
import {
  buildBatchStockAsOfDate,
  parseAsOfDate,
  summarizeStockForExport,
} from "@/lib/stock/snapshot";
import type { BatchMetadataRow, LedgerMovementRow } from "@/lib/stock/snapshot";
import { buildItemCostEvolution } from "@/lib/reports/item-cost-evolution";
import { buildItemStatement } from "@/lib/reports/item-statement";
import { buildStockSummary } from "@/lib/reports/stock-summary";
import { buildSupplierReport } from "@/lib/reports/supplier-reports";
import { toCsv } from "@/lib/utils/csv";
import { fail } from "@/lib/utils/http";

function getCurrentMonthDateRange() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month, now.getUTCDate()));
  return {
    fromDate: start.toISOString().slice(0, 10),
    toDate: end.toISOString().slice(0, 10),
  };
}

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const url = new URL(request.url);
  const entity = url.searchParams.get("entity");
  const includeInactive = url.searchParams.get("include_inactive") === "true";

  if (
    !entity ||
    ![
      "products",
      "stock",
      "transactions",
      "stock-summary",
      "item-statement",
      "item-cost-evolution",
      "supplier",
    ].includes(entity)
  ) {
    return fail(
      "Invalid export entity. Use products, stock, transactions, stock-summary, item-statement, item-cost-evolution, or supplier.",
      422,
    );
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

  if (entity === "stock-summary") {
    const locationId = url.searchParams.get("location_id");
    const asOfDate = url.searchParams.get("as_of_date");
    const view = url.searchParams.get("view") === "totals" ? "totals" : "details";

    const result = await buildStockSummary(context, {
      asOfDate,
      locationId,
    });
    if ("error" in result) {
      return fail(result.error, 422);
    }

    rows = (view === "totals" ? result.totals : result.details) as Record<string, unknown>[];
  }

  if (entity === "item-statement") {
    const productId = url.searchParams.get("product_id");
    const fromDate = url.searchParams.get("from_date");
    const toDate = url.searchParams.get("to_date");
    const locationId = url.searchParams.get("location_id");

    if (!productId) {
      return fail("product_id is required for item-statement export.", 422);
    }
    if (!fromDate || !toDate) {
      return fail("from_date and to_date are required for item-statement export.", 422);
    }

    const result = await buildItemStatement(context, {
      productId,
      fromDate,
      toDate,
      locationId,
    });
    if ("error" in result) {
      return fail(result.error, 422);
    }

    rows = [
      {
        row_type: "OPENING",
        occurred_at: `${fromDate}T00:00:00.000Z`,
        tx_number: null,
        transaction_type: "OPENING",
        transaction_status: null,
        location_id: locationId ?? null,
        location_code: null,
        location_name: null,
        direction: null,
        qty: null,
        signed_qty: null,
        running_qty: result.opening_qty,
        unit_cost: null,
        reason_code: null,
      },
      ...result.rows,
    ] as Record<string, unknown>[];
  }

  if (entity === "item-cost-evolution") {
    const productId = url.searchParams.get("product_id");
    const fromDate = url.searchParams.get("from_date");
    const toDate = url.searchParams.get("to_date");
    const locationId = url.searchParams.get("location_id");

    if (!productId) {
      return fail("product_id is required for item-cost-evolution export.", 422);
    }
    if (!fromDate || !toDate) {
      return fail(
        "from_date and to_date are required for item-cost-evolution export.",
        422,
      );
    }

    const result = await buildItemCostEvolution(context, {
      productId,
      fromDate,
      toDate,
      locationId,
    });
    if ("error" in result) {
      return fail(result.error, 422);
    }

    rows = result.rows as Record<string, unknown>[];
  }

  if (entity === "supplier") {
    const fallbackRange = getCurrentMonthDateRange();
    const fromDate = url.searchParams.get("from_date") ?? fallbackRange.fromDate;
    const toDate = url.searchParams.get("to_date") ?? fallbackRange.toDate;
    const supplierId = url.searchParams.get("supplier_id");
    const rawStatus = url.searchParams.get("status_filter");
    const statusFilter = rawStatus === "OPEN" || rawStatus === "VOID" ? rawStatus : null;

    const result = await buildSupplierReport(context, {
      fromDate,
      toDate,
      supplierId,
      statusFilter,
    });
    if ("error" in result) {
      return fail(result.error, 422);
    }

    rows = result.rows as Record<string, unknown>[];
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
