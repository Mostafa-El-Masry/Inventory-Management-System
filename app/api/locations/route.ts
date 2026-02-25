import { getAuthContext, assertRole } from "@/lib/auth/permissions";
import {
  locationCreateSchema,
  locationPatchSchema,
} from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const includeInactive =
    new URL(request.url).searchParams.get("include_inactive") === "true";

  let query = context.supabase
    .from("locations")
    .select("*")
    .order("name", { ascending: true });

  if (context.profile.role !== "admin") {
    if (context.locationIds.length === 0) {
      return ok({ items: [] });
    }

    query = query.in("id", context.locationIds);
  }

  if (!includeInactive) {
    query = query.eq("is_active", true);
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

  const roleError = assertRole(context, ["admin"]);
  if (roleError) {
    return roleError;
  }

  const payload = await parseBody(request, locationCreateSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const { data, error } = await context.supabase
    .from("locations")
    .insert(payload.data)
    .select("*")
    .single();

  if (error) {
    return fail(error.message, 400);
  }

  return ok(data, 201);
}

export async function PATCH(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const roleError = assertRole(context, ["admin"]);
  if (roleError) {
    return roleError;
  }

  const payload = await parseBody(request, locationPatchSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const { id, ...updates } = payload.data;
  const { data, error } = await context.supabase
    .from("locations")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return fail(error.message, 400);
  }

  return ok(data);
}
