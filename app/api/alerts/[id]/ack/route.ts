import {
  assertLocationAccess,
  assertRole,
  getAuthContext,
} from "@/lib/auth/permissions";
import { alertAckSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

export async function POST(
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

  const payload = await parseBody(request, alertAckSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const { id } = await params;
  const { data: alert, error: alertError } = await context.supabase
    .from("alerts")
    .select("id, location_id, status")
    .eq("id", id)
    .single();

  if (alertError || !alert) {
    return fail(alertError?.message ?? "Alert not found.", 404);
  }

  const locationError = assertLocationAccess(
    context,
    alert.location_id as string | null,
  );
  if (locationError) {
    return locationError;
  }

  if (alert.status === "ACKED") {
    return ok({ success: true, alreadyAcked: true });
  }

  const { data, error } = await context.supabase
    .from("alerts")
    .update({
      status: "ACKED",
      acked_by: context.user.id,
      acked_at: new Date().toISOString(),
      ack_note: payload.data.note ?? null,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return fail(error.message, 400);
  }

  return ok({ success: true, alert: data });
}
