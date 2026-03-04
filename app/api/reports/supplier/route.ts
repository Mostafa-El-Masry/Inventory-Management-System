import { getAuthContext } from "@/lib/auth/permissions";
import { buildSupplierReport } from "@/lib/reports/supplier-reports";
import { fail, ok } from "@/lib/utils/http";

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

  return ok({
    from_date: fromDate,
    to_date: toDate,
    rows: result.rows,
    summary: result.summary,
  });
}
