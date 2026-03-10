import { assertMasterPermission, getAuthContext } from "@/lib/auth/permissions";
import { deriveNamePrefix, nextPrefixedCode } from "@/lib/locations/code";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supplierCreateSchema, supplierUpdateSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

function normalizeSupplierName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeStoredSupplierName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const includeInactive =
    new URL(request.url).searchParams.get("include_inactive") === "true";

  let query = context.supabase
    .from("suppliers")
    .select("id, code, name, phone, email, is_active, created_at, updated_at")
    .order("name", { ascending: true });

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

  const permissionError = assertMasterPermission(context, "suppliers", "create");
  if (permissionError) {
    return permissionError;
  }
  const writeClient = context.profile.role === "admin" ? context.supabase : supabaseAdmin;

  const payload = await parseBody(request, supplierCreateSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const normalizedName = normalizeStoredSupplierName(payload.data.name);
  const normalizedNameKey = normalizeSupplierName(normalizedName);
  const normalizedPhone = payload.data.phone?.trim() || null;
  const normalizedEmail = payload.data.email?.trim().toLowerCase() || null;
  const normalizedCode = payload.data.code?.trim().toUpperCase() || null;

  const { data: existingRows, error: existingError } = await writeClient
    .from("suppliers")
    .select("id, name");
  if (existingError) {
    return fail(existingError.message, 400);
  }

  if (
    (existingRows ?? []).some(
      (row: { name: string }) => normalizeSupplierName(row.name) === normalizedNameKey,
    )
  ) {
    return fail("Supplier name already exists.", 409);
  }

  if (normalizedCode) {
    const { data, error } = await writeClient
      .from("suppliers")
      .insert({
        code: normalizedCode,
        name: normalizedName,
        phone: normalizedPhone,
        email: normalizedEmail,
        is_active: payload.data.is_active,
      })
      .select("id, code, name, phone, email, is_active, created_at, updated_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return fail("Supplier code already exists.", 409);
      }
      return fail(error.message, 400);
    }

    return ok(data, 201);
  }

  const prefix = deriveNamePrefix(normalizedName, "SUP");
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data: codeRows, error: codeRowsError } = await writeClient
      .from("suppliers")
      .select("code")
      .like("code", `${prefix}-%`);
    if (codeRowsError) {
      return fail(codeRowsError.message, 400);
    }

    const nextCode = nextPrefixedCode(
      prefix,
      (codeRows ?? []).map((row: { code: string }) => row.code),
    );

    const { data, error } = await writeClient
      .from("suppliers")
      .insert({
        code: nextCode,
        name: normalizedName,
        phone: normalizedPhone,
        email: normalizedEmail,
        is_active: payload.data.is_active,
      })
      .select("id, code, name, phone, email, is_active, created_at, updated_at")
      .single();

    if (!error) {
      return ok(data, 201);
    }

    if (error.code === "23505") {
      continue;
    }

    return fail(error.message, 400);
  }

  return fail("Failed to generate a unique supplier code.", 409);
}

export async function PATCH(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const permissionError = assertMasterPermission(context, "suppliers", "edit");
  if (permissionError) {
    return permissionError;
  }
  const writeClient = context.profile.role === "admin" ? context.supabase : supabaseAdmin;

  const payload = await parseBody(request, supplierUpdateSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const normalizedName = normalizeStoredSupplierName(payload.data.name);
  const normalizedNameKey = normalizeSupplierName(normalizedName);

  const { data: existingRows, error: existingError } = await writeClient
    .from("suppliers")
    .select("id, name");
  if (existingError) {
    return fail(existingError.message, 400);
  }

  if (
    (existingRows ?? []).some(
      (row: { id: string; name: string }) =>
        row.id !== payload.data.id && normalizeSupplierName(row.name) === normalizedNameKey,
    )
  ) {
    return fail("Supplier name already exists.", 409);
  }

  const { data, error } = await writeClient
    .from("suppliers")
    .update({
      name: normalizedName,
    })
    .eq("id", payload.data.id)
    .select("id, code, name, phone, email, is_active, created_at, updated_at")
    .single();

  if (error) {
    return fail(error.message, 400);
  }

  if (!data) {
    return fail("Supplier not found.", 404);
  }

  return ok(data);
}
