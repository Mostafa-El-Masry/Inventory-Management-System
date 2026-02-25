import { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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

export function getAuthCapabilities(role: Role): AuthCapabilities {
  const isAdmin = role === "admin";
  const isManager = role === "manager";

  return {
    canManageUsers: isAdmin,
    canCreateProductMaster: isAdmin,
    canEditProductMaster: isAdmin,
    canArchiveProducts: isAdmin,
    canManageLocations: isAdmin,
    canArchiveLocations: isAdmin,
    canEditProductPolicies: isAdmin || isManager,
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

  const { data: rawProfile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle<{
      id: string;
      full_name: string | null;
      role: string;
      is_active: boolean;
      created_at: string | null;
      updated_at: string | null;
    }>();

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

  const profile: Profile = {
    id: rawProfile.id,
    full_name: rawProfile.full_name ?? "",
    role: normalizedRole,
    is_active: Boolean(rawProfile.is_active),
    created_at: rawProfile.created_at ?? "",
    updated_at: rawProfile.updated_at ?? "",
  };

  if (!profile.is_active) {
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
    capabilities: getAuthCapabilities(profile.role),
  };
}
