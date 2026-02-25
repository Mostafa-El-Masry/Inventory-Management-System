import { assertRole, getAuthContext } from "@/lib/auth/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { userLocationAssignSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const roleError = assertRole(context, ["admin"]);
  if (roleError) {
    return roleError;
  }

  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("user_location_access")
    .select("location_id, locations(id, code, name)")
    .eq("user_id", id);

  if (error) {
    return fail(error.message, 400);
  }

  return ok({ items: data ?? [] });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const roleError = assertRole(context, ["admin"]);
  if (roleError) {
    return roleError;
  }

  const payload = await parseBody(request, userLocationAssignSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const { id } = await params;
  const { error: deleteError } = await supabaseAdmin
    .from("user_location_access")
    .delete()
    .eq("user_id", id);

  if (deleteError) {
    return fail(deleteError.message, 400);
  }

  if (payload.data.location_ids.length > 0) {
    const rows = payload.data.location_ids.map((locationId) => ({
      user_id: id,
      location_id: locationId,
    }));

    const { error: insertError } = await supabaseAdmin
      .from("user_location_access")
      .insert(rows);

    if (insertError) {
      return fail(insertError.message, 400);
    }
  }

  return ok({ success: true });
}
