import { getAuthContext } from "@/lib/auth/permissions";
import { fail, ok } from "@/lib/utils/http";

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 300);

  let query = context.supabase
    .from("alerts")
    .select("*, products(name, sku), locations(name, code)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }

  if (context.profile.role !== "admin") {
    if (context.locationIds.length === 0) {
      return ok({ items: [] });
    }
    query = query.in("location_id", context.locationIds);
  }

  const { data, error } = await query;
  if (error) {
    return fail(error.message, 400);
  }

  return ok({ items: data ?? [] });
}
