import { assertLocationAccess, getAuthContext } from "@/lib/auth/permissions";
import { buildStockSummary } from "@/lib/reports/stock-summary";
import { fail, ok } from "@/lib/utils/http";

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const url = new URL(request.url);
  const asOfDate = url.searchParams.get("as_of_date");
  const locationId = url.searchParams.get("location_id");

  const locationError = assertLocationAccess(context, locationId);
  if (locationError) {
    return locationError;
  }

  const result = await buildStockSummary(context, {
    asOfDate,
    locationId,
  });
  if ("error" in result) {
    return fail(result.error, 422);
  }

  return ok({
    as_of_date: asOfDate,
    details: result.details,
    totals: result.totals,
  });
}
