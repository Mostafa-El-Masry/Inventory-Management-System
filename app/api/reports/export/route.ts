import { getAuthContext } from "@/lib/auth/permissions";
import { toCsv } from "@/lib/utils/csv";
import { fail } from "@/lib/utils/http";

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const url = new URL(request.url);
  const entity = url.searchParams.get("entity");

  if (!entity || !["products", "stock", "transactions"].includes(entity)) {
    return fail("Invalid export entity. Use products, stock, or transactions.", 422);
  }

  const isAdmin = context.profile.role === "admin";
  const noLocationAccess = !isAdmin && context.locationIds.length === 0;

  let rows: Record<string, unknown>[] = [];

  if (entity === "products") {
    const { data, error } = await context.supabase
      .from("products")
      .select("id, sku, barcode, name, unit, is_active, created_at")
      .order("name", { ascending: true });

    if (error) {
      return fail(error.message, 400);
    }

    rows = (data ?? []) as Record<string, unknown>[];
  }

  if (entity === "stock") {
    if (noLocationAccess) {
      rows = [];
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
