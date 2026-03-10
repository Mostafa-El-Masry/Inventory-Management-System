import { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  hasAnyMasterPermission,
  hasMasterPermission as hasMasterPermissionValue,
  isMissingMasterPermissionsColumnError,
  type MasterPermissionAction,
  type MasterPermissionEntity,
  normalizeMasterPermissions,
  PROFILE_SELECT_BASE,
  PROFILE_SELECT_WITH_MASTER_PERMISSIONS,
} from "@/lib/master-permissions";
import { Profile, Role } from "@/lib/types/domain";
import { AuthCapabilities } from "@/lib/types/api";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface AuthContext {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  user: User;
  profile: Profile;
  locationIds: string[];
  capabilities: AuthCapabilities;
}

export function getAuthCapabilities(role: Role, masterPermissionsInput?: unknown): AuthCapabilities {
  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const master = normalizeMasterPermissions(masterPermissionsInput, role);

  return {
    canManageUsers: isAdmin,
    canCreateProductMaster:
      isAdmin ||
      hasAnyMasterPermission(master, "products") ||
      hasAnyMasterPermission(master, "categories", ["create", "import"]) ||
      hasAnyMasterPermission(master, "subcategories", ["create", "import"]),
    canEditProductMaster:
      isAdmin ||
      hasAnyMasterPermission(master, "products") ||
      hasAnyMasterPermission(master, "categories") ||
      hasAnyMasterPermission(master, "subcategories"),
    canArchiveProducts:
      isAdmin ||
      hasAnyMasterPermission(master, "products", ["archive", "delete"]),
    canManageLocations: isAdmin || hasAnyMasterPermission(master, "locations"),
    canArchiveLocations:
      isAdmin || hasAnyMasterPermission(master, "locations", ["archive"]),
    canManageSuppliers: isAdmin || hasAnyMasterPermission(master, "suppliers"),
    canManageSystemSettings: isAdmin,
    canRecordSupplierPayments: isAdmin || isManager,
    master,
  };
}

export function hasAnyRole(role: Role, allowed: Role[]) {
  return allowed.includes(role);
}

export function canAccessLocation(context: AuthContext, locationId: string) {
  if (context.profile.role === "admin") {
    return true;
  }

  return context.locationIds.includes(locationId);
}

export function assertRole(context: AuthContext, allowed: Role[]) {
  if (hasAnyRole(context.profile.role, allowed)) {
    return null;
  }

  return NextResponse.json(
    {
      error: `Role '${context.profile.role}' is not authorized for this action.`,
    },
    { status: 403 },
  );
}

export function hasMasterPermission<Entity extends MasterPermissionEntity>(
  context: Pick<AuthContext, "capabilities">,
  entity: Entity,
  action: MasterPermissionAction<Entity>,
) {
  return hasMasterPermissionValue(context.capabilities.master, entity, action);
}

export function assertMasterPermission<Entity extends MasterPermissionEntity>(
  context: Pick<AuthContext, "capabilities" | "profile">,
  entity: Entity,
  action: MasterPermissionAction<Entity>,
) {
  if (hasMasterPermission(context as Pick<AuthContext, "capabilities">, entity, action)) {
    return null;
  }

  return NextResponse.json(
    {
      error: `${context.profile.role} is not authorized to ${String(action)} ${String(entity)}.`,
    },
    { status: 403 },
  );
}

export function assertLocationAccess(context: AuthContext, locationId?: string | null) {
  if (!locationId) {
    return null;
  }

  if (canAccessLocation(context, locationId)) {
    return null;
  }

  return NextResponse.json(
    {
      error: `No access to location '${locationId}'.`,
    },
    { status: 403 },
  );
}

export async function getAuthContext(): Promise<AuthContext | NextResponse> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  type RawProfileRow = {
    id: string;
    full_name: string | null;
    role: string;
    is_active: boolean;
    created_at: string | null;
    updated_at: string | null;
    master_permissions?: unknown;
  };

  type LegacyProfileRow = Omit<RawProfileRow, "master_permissions">;

  let { data: rawProfile, error: profileError } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT_WITH_MASTER_PERMISSIONS)
    .eq("id", user.id)
    .maybeSingle<RawProfileRow>();

  if (profileError && isMissingMasterPermissionsColumnError(profileError)) {
    const fallback = await supabase
      .from("profiles")
      .select(PROFILE_SELECT_BASE)
      .eq("id", user.id)
      .maybeSingle<LegacyProfileRow>();

    rawProfile = fallback.data
      ? {
          ...fallback.data,
          master_permissions: null,
        }
      : null;
    profileError = fallback.error;
  }

  if (profileError || !rawProfile) {
    return NextResponse.json(
      {
        error: profileError?.message ?? "User profile not found.",
      },
      { status: 403 },
    );
  }

  const normalizedRole: Role =
    rawProfile.role === "admin" ||
    rawProfile.role === "manager" ||
    rawProfile.role === "staff"
      ? rawProfile.role
      : "staff";

  const masterPermissions = normalizeMasterPermissions(
    rawProfile.master_permissions ?? null,
    normalizedRole,
  );

  const profile: Profile = {
    id: rawProfile.id,
    full_name: rawProfile.full_name ?? "",
    role: normalizedRole,
    is_active: Boolean(rawProfile.is_active),
    created_at: rawProfile.created_at ?? "",
    updated_at: rawProfile.updated_at ?? "",
    master_permissions: masterPermissions,
  };

  if (!profile.is_active) {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      console.warn(`[AUTH] Failed to sign out inactive user ${user.id}: ${signOutError.message}`);
    }
    return NextResponse.json({ error: "User account is inactive." }, { status: 403 });
  }

  const { data: accessRows, error: accessError } = await supabase
    .from("user_location_access")
    .select("location_id")
    .eq("user_id", user.id);

  if (accessError) {
    return NextResponse.json({ error: accessError.message }, { status: 400 });
  }

  const locationIds = (accessRows ?? []).map((row: { location_id: string }) => row.location_id);

  return {
    supabase,
    user,
    profile,
    locationIds,
    capabilities: getAuthCapabilities(profile.role, profile.master_permissions),
  };
}
