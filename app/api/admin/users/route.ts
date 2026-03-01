import { assertRole, getAuthContext } from "@/lib/auth/permissions";
import { resolveTrustedOrigin } from "@/lib/auth/trusted-origin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { userCreateSchema, userPatchSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

type AuthListUser = {
  id: string;
  email?: string;
};

function normalizeAdminErrorMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("duplicate key") || lower.includes("already")) {
    return { status: 409, message: "A user with this email already exists." };
  }

  return { status: 400, message };
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
    supabaseAdmin
      .from("profiles")
      .select("id, full_name, role, is_active, created_at, updated_at")
      .order("created_at", { ascending: false }),
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

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        id: authUserId,
        full_name: payload.data.full_name,
        role: payload.data.role,
        is_active: true,
      },
      { onConflict: "id" },
    )
    .select("id, full_name, role, is_active, created_at, updated_at")
    .single();

  if (profileError) {
    if (authUserId) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
    }
    return fail(profileError.message, 400);
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

  const { id, ...updates } = payload.data;
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(updates)
    .eq("id", id)
    .select("id, full_name, role, is_active, created_at, updated_at")
    .single();

  if (error) {
    return fail(error.message, 400);
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

  return ok(data);
}
