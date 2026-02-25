import {
  assertLocationAccess,
  assertRole,
  getAuthContext,
} from "@/lib/auth/permissions";
import { transferCreateSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

  let query = context.supabase
    .from("transfers")
    .select("*, transfer_lines(*)")
    .order("created_at", { ascending: false })
    .limit(limit);

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

  const sourceError = assertLocationAccess(context, payload.data.from_location_id);
  if (sourceError) {
    return sourceError;
  }

  const destinationError = assertLocationAccess(context, payload.data.to_location_id);
  if (destinationError) {
    return destinationError;
  }

  if (payload.data.from_location_id === payload.data.to_location_id) {
    return fail("Transfer source and destination must be different.", 422);
  }

  const { data: transfer, error: transferError } = await context.supabase
    .from("transfers")
    .insert({
      transfer_number: `TR-${Date.now()}`,
      from_location_id: payload.data.from_location_id,
      to_location_id: payload.data.to_location_id,
      status: "REQUESTED",
      notes: payload.data.notes ?? null,
      requested_by: context.user.id,
    })
    .select("*")
    .single();

  if (transferError || !transfer) {
    return fail(transferError?.message ?? "Failed to create transfer.", 400);
  }

  const transferLines = payload.data.lines.map((line) => ({
    transfer_id: transfer.id,
    ...line,
    dispatched_qty: 0,
    received_qty: 0,
  }));

  const { data: lines, error: linesError } = await context.supabase
    .from("transfer_lines")
    .insert(transferLines)
    .select("*");

  if (linesError) {
    return fail(linesError.message, 400);
  }

  return ok(
    {
      ...transfer,
      lines: lines ?? [],
    },
    201,
  );
}
