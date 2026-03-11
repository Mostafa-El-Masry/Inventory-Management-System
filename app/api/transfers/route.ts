import {
  assertRole,
  getAuthContext,
} from "@/lib/auth/permissions";
import { createTransfer } from "@/lib/transfers/mutations";
import { transferCreateSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

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
  const status = url.searchParams.get("status");
  const limit = Math.min(parsePositiveInt(url.searchParams.get("limit"), 50), 200);
  const page = parsePositiveInt(url.searchParams.get("page"), 1);
  const offset = (page - 1) * limit;
  const end = offset + limit - 1;

  let query = context.supabase
    .from("transfers")
    .select("*, transfer_lines(*)")
    .order("created_at", { ascending: false })
    .range(offset, end);

  if (status) {
    query = query.eq("status", status);
  }

  if (context.profile.role !== "admin") {
    if (context.locationIds.length === 0) {
      return ok({ items: [] });
    }
    const locFilter = context.locationIds.join(",");
    query = query.or(
      `from_location_id.in.(${locFilter}),to_location_id.in.(${locFilter})`,
    );
  }

  const { data, error } = await query;
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

  const payload = await parseBody(request, transferCreateSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const result = await createTransfer(context, payload.data);
  if (!result.ok) {
    return fail(result.error, result.status);
  }

  return ok(result.data, result.status);
}
