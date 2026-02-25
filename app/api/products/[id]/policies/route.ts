import { z } from "zod";

import {
  assertLocationAccess,
  assertRole,
  getAuthContext,
} from "@/lib/auth/permissions";
import { productPolicySchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

const patchSchema = productPolicySchema.partial().extend({
  location_id: z.string().uuid(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const { id } = await params;
  let query = context.supabase
    .from("product_location_policies")
    .select("*")
    .eq("product_id", id);

  if (context.profile.role !== "admin") {
    if (context.locationIds.length === 0) {
      return ok({ items: [] });
    }

    query = query.in("location_id", context.locationIds);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    return fail(error.message, 400);
  }

  return ok({ items: data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const roleError = assertRole(context, ["admin", "manager"]);
  if (roleError) {
    return roleError;
  }

  const { id } = await params;
  const payload = await parseBody(request, productPolicySchema);
  if ("error" in payload) {
    return payload.error;
  }

  const locationError = assertLocationAccess(context, payload.data.location_id);
  if (locationError) {
    return locationError;
  }

  const record = {
    ...payload.data,
    product_id: id,
  };

  const { data, error } = await context.supabase
    .from("product_location_policies")
    .upsert(record, { onConflict: "product_id,location_id" })
    .select("*")
    .single();

  if (error) {
    return fail(error.message, 400);
  }

  return ok(data, 201);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const roleError = assertRole(context, ["admin", "manager"]);
  if (roleError) {
    return roleError;
  }

  const { id } = await params;
  const payload = await parseBody(request, patchSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const locationError = assertLocationAccess(context, payload.data.location_id);
  if (locationError) {
    return locationError;
  }

  const { location_id, ...updates } = payload.data;
  const { data, error } = await context.supabase
    .from("product_location_policies")
    .update(updates)
    .eq("product_id", id)
    .eq("location_id", location_id)
    .select("*")
    .single();

  if (error) {
    return fail(error.message, 400);
  }

  return ok(data);
}
