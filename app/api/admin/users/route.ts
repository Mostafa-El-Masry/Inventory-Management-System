import { assertRole, getAuthContext } from "@/lib/auth/permissions";
import { resolveTrustedOrigin } from "@/lib/auth/trusted-origin";
import {
  PROFILE_SELECT_BASE,
  PROFILE_SELECT_WITH_MASTER_PERMISSIONS,
  isMissingMasterPermissionsColumnError,
  type MasterPermissionRole,
  normalizeMasterPermissions,
  serializeMasterPermissions,
} from "@/lib/master-permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { userCreateSchema, userPatchSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

type AuthListUser = {
  id: string;
  email?: string;
};

const AUTH_BAN_DURATION = "876000h";

function normalizeAdminErrorMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("duplicate key") || lower.includes("already")) {
    return { status: 409, message: "A user with this email already exists." };
  }

  return { status: 400, message };
}

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  master_permissions?: unknown;
};

type LegacyProfileRow = Omit<ProfileRow, "master_permissions">;

function toProfileRow(profile: LegacyProfileRow): ProfileRow {
  return {
    ...profile,
    master_permissions: null,
  };
}

function toMasterPermissionRole(
  role: string | null | undefined,
): MasterPermissionRole | null {
  return role === "admin" || role === "manager" || role === "staff" ? role : null;
}

async function listProfilesWithMasterPermissionsFallback() {
  const result = await supabaseAdmin
    .from("profiles")
    .select(PROFILE_SELECT_WITH_MASTER_PERMISSIONS)
    .order("created_at", { ascending: false });

  if (!result.error || !isMissingMasterPermissionsColumnError(result.error)) {
    return result as { data: ProfileRow[] | null; error: typeof result.error };
  }

  const fallback = await supabaseAdmin
    .from("profiles")
    .select(PROFILE_SELECT_BASE)
    .order("created_at", { ascending: false });

  return {
    data: (fallback.data ?? []).map((profile) => toProfileRow(profile as LegacyProfileRow)),
    error: fallback.error,
  } as const;
}

async function upsertProfileWithMasterPermissionsFallback(values: Record<string, unknown>) {
  const result = await supabaseAdmin
    .from("profiles")
    .upsert(values, { onConflict: "id" })
    .select(PROFILE_SELECT_WITH_MASTER_PERMISSIONS)
    .single<ProfileRow>();

  if (!result.error || !isMissingMasterPermissionsColumnError(result.error)) {
    return result;
  }

  const legacyValues = { ...values };
  delete legacyValues.master_permissions;

  const fallback = await supabaseAdmin
    .from("profiles")
    .upsert(legacyValues, { onConflict: "id" })
    .select(PROFILE_SELECT_BASE)
    .single<LegacyProfileRow>();

  return {
    data: fallback.data ? toProfileRow(fallback.data) : null,
    error: fallback.error,
  } as const;
}

async function updateProfileWithMasterPermissionsFallback(
  userId: string,
  values: Record<string, unknown>,
) {
  const result = await supabaseAdmin
    .from("profiles")
    .update(values)
    .eq("id", userId)
    .select(PROFILE_SELECT_WITH_MASTER_PERMISSIONS)
    .single<ProfileRow>();

  if (!result.error || !isMissingMasterPermissionsColumnError(result.error)) {
    return result;
  }

  const legacyValues = { ...values };
  delete legacyValues.master_permissions;

  const fallback = await supabaseAdmin
    .from("profiles")
    .update(legacyValues)
    .eq("id", userId)
    .select(PROFILE_SELECT_BASE)
    .single<LegacyProfileRow>();

  return {
    data: fallback.data ? toProfileRow(fallback.data) : null,
    error: fallback.error,
  } as const;
}

async function listAllAuthUsers() {
  const users: AuthListUser[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      return { users: null, error } as const;
    }

    const rows = data.users.map((user) => ({
      id: user.id,
      email: user.email,
    }));
    users.push(...rows);

    if (rows.length < perPage) {
      break;
    }
    page += 1;
  }

  return { users, error: null } as const;
}

async function ensureLastAdminSafety(userId: string, nextRole?: string, nextActive?: boolean) {
  const { data: target, error: targetError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", userId)
    .maybeSingle<{
      id: string;
      role: string;
      is_active: boolean;
    }>();

  if (targetError) {
    return { error: targetError.message, status: 400 } as const;
  }
  if (!target) {
    return { error: "User profile was not found.", status: 404 } as const;
  }

  const effectiveRole = nextRole ?? target.role;
  const effectiveActive = typeof nextActive === "boolean" ? nextActive : target.is_active;
  const wouldRemainActiveAdmin = effectiveRole === "admin" && effectiveActive;

  if (target.role === "admin" && target.is_active && !wouldRemainActiveAdmin) {
    const { count, error: countError } = await supabaseAdmin
      .from("profiles")
      .select("id", { head: true, count: "exact" })
      .eq("role", "admin")
      .eq("is_active", true);

    if (countError) {
      return { error: countError.message, status: 400 } as const;
    }

    if ((count ?? 0) <= 1) {
      return {
        error: "At least one active admin is required.",
        status: 409,
      } as const;
    }
  }

  return { target } as const;
}

async function syncAuthBanState(userId: string, isActive: boolean) {
  const banDuration = isActive ? "none" : AUTH_BAN_DURATION;
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: banDuration,
  });

  if (error) {
    return {
      error: `Failed to ${isActive ? "unban" : "ban"} user authentication state.`,
      details: error.message,
      status: 500,
    } as const;
  }

  return { error: null, details: null, status: 200 } as const;
}

export async function GET() {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const roleError = assertRole(context, ["admin"]);
  if (roleError) {
    return roleError;
  }

  const [profilesResult, authUsersResult] = await Promise.all([
    listProfilesWithMasterPermissionsFallback(),
    listAllAuthUsers(),
  ]);

  if (profilesResult.error) {
    return fail(profilesResult.error.message, 400);
  }

  if (authUsersResult.error) {
    return fail(authUsersResult.error.message, 400);
  }

  const emailByUserId = new Map(
    authUsersResult.users.map((user) => [user.id, user.email ?? null]),
  );

  const items = (profilesResult.data ?? []).map((profile) => ({
    ...profile,
    email: emailByUserId.get(profile.id) ?? null,
    master_permissions: normalizeMasterPermissions(
      profile.master_permissions ?? null,
      toMasterPermissionRole(profile.role) ?? "staff",
    ),
  }));

  return ok({ items });
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

  const payload = await parseBody(request, userCreateSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const { origin } = resolveTrustedOrigin(request);
  const redirectTo = `${origin}/auth/callback?next=/auth/set-password`;

  if (payload.data.location_ids.length > 0) {
    const { count, error: locationError } = await supabaseAdmin
      .from("locations")
      .select("id", { head: true, count: "exact" })
      .in("id", payload.data.location_ids);

    if (locationError) {
      return fail(locationError.message, 400);
    }

    if ((count ?? 0) !== payload.data.location_ids.length) {
      return fail("One or more selected locations do not exist.", 422);
    }
  }

  let authUserId: string | null = null;
  let createdByFlow: "invite" | "password" | null = null;

  if (payload.data.mode === "invite") {
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      payload.data.email,
      {
        redirectTo,
        data: { full_name: payload.data.full_name },
      },
    );

    if (error || !data.user) {
      const normalized = normalizeAdminErrorMessage(
        error?.message ?? "Failed to invite user.",
      );
      return fail(normalized.message, normalized.status);
    }

    authUserId = data.user.id;
    createdByFlow = "invite";
  } else {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: payload.data.email,
      password: payload.data.password!,
      email_confirm: true,
      user_metadata: { full_name: payload.data.full_name },
    });

    if (error || !data.user) {
      const normalized = normalizeAdminErrorMessage(
        error?.message ?? "Failed to create user.",
      );
      return fail(normalized.message, normalized.status);
    }

    authUserId = data.user.id;
    createdByFlow = "password";
  }

  const { data: profile, error: profileError } =
    await upsertProfileWithMasterPermissionsFallback({
      id: authUserId,
      full_name: payload.data.full_name,
      role: payload.data.role,
      is_active: true,
      master_permissions: serializeMasterPermissions(
        payload.data.master_permissions,
        payload.data.role,
      ),
    });

  if (profileError) {
    if (authUserId) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
    }
    return fail(profileError.message, 400);
  }

  if (!profile) {
    if (authUserId) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
    }
    return fail("User profile could not be created.", 500);
  }

  if (payload.data.location_ids.length > 0) {
    const rows = payload.data.location_ids.map((locationId) => ({
      user_id: authUserId,
      location_id: locationId,
    }));

    const { error: locationAccessError } = await supabaseAdmin
      .from("user_location_access")
      .upsert(rows, { onConflict: "user_id,location_id" });

    if (locationAccessError) {
      await supabaseAdmin.from("profiles").delete().eq("id", authUserId);
      if (authUserId) {
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
      }
      return fail(locationAccessError.message, 400);
    }
  }

  return ok(
    {
      ...profile,
      email: payload.data.email,
      provision_mode: createdByFlow,
      master_permissions: normalizeMasterPermissions(
        profile.master_permissions ?? null,
        toMasterPermissionRole(payload.data.role),
      ),
    },
    201,
  );
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

  const payload = await parseBody(request, userPatchSchema);
  if ("error" in payload) {
    return payload.error;
  }

  if (payload.data.id === context.user.id) {
    const selfDisable = payload.data.is_active === false;
    const selfDemote =
      typeof payload.data.role === "string" && payload.data.role !== "admin";

    if (selfDisable || selfDemote) {
      return fail("You cannot disable or demote your own admin account.", 409);
    }
  }

  const safety = await ensureLastAdminSafety(
    payload.data.id,
    payload.data.role,
    payload.data.is_active,
  );
  if ("error" in safety && safety.error) {
    return fail(safety.error, safety.status ?? 400);
  }

  const { id, master_permissions, ...updates } = payload.data;
  const normalizedUpdates = {
    ...updates,
    ...(master_permissions
        ? {
          master_permissions: serializeMasterPermissions(
            master_permissions,
            toMasterPermissionRole(updates.role ?? safety.target?.role ?? null),
          ),
        }
      : updates.role === "admin"
        ? { master_permissions: {} }
        : {}),
  };
  const { data, error } = await updateProfileWithMasterPermissionsFallback(
    id,
    normalizedUpdates,
  );

  if (error) {
    return fail(error.message, 400);
  }

  if (!data) {
    return fail("User profile could not be updated.", 500);
  }

  if (updates.is_active === false) {
    const { error: revokeError } = await supabaseAdmin
      .from("user_location_access")
      .delete()
      .eq("user_id", id);

    if (revokeError) {
      return fail(revokeError.message, 400);
    }
  }

  if (typeof updates.is_active === "boolean") {
    const banSync = await syncAuthBanState(id, updates.is_active);
    if (banSync.error) {
      console.error("[AUTH] Failed to synchronize user ban state during PATCH", {
        user_id: id,
        target_active: updates.is_active,
        error: banSync.details,
        route: "admin/users PATCH",
      });
      return fail(banSync.error, banSync.status);
    }
  }

  return ok({
    ...data,
    master_permissions: normalizeMasterPermissions(
      data.master_permissions ?? null,
      toMasterPermissionRole(data.role) ?? "staff",
    ),
  });
}
