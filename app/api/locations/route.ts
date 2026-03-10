import { assertMasterPermission, assertRole, getAuthContext } from "@/lib/auth/permissions";
import { deriveNamePrefix, nextPrefixedCode } from "@/lib/locations/code";
import { supabaseAdmin } from "@/lib/supabase/admin";
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

  const permissionError = assertMasterPermission(context, "locations", "create");
  if (permissionError) {
    return permissionError;
  }
  const writeClient = context.profile.role === "admin" ? context.supabase : supabaseAdmin;

  const payload = await parseBody(request, locationCreateSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const { name, timezone, is_active } = payload.data;
  const prefix = deriveNamePrefix(name, "LOC");
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data: existingRows, error: listError } = await writeClient
      .from("locations")
      .select("code")
      .like("code", `${prefix}-%`);

    if (listError) {
      return fail(listError.message, 400);
    }

    const existingCodes = (existingRows ?? []).map((row: { code: string }) => row.code);
    const code = nextPrefixedCode(prefix, existingCodes);

    const { data, error } = await writeClient
      .from("locations")
      .insert({
        code,
        name,
        timezone,
        is_active,
      })
      .select("*")
      .single();

    if (!error) {
      return ok(data, 201);
    }

    if (error.code === "23505") {
      continue;
    }

    return fail(error.message, 400);
  }

  return fail("Failed to generate a unique location code.", 409);
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
