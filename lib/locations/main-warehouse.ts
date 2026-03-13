import {
  MAIN_WAREHOUSE_CODE,
  MAIN_WAREHOUSE_NAME,
  MAIN_WAREHOUSE_TIMEZONE,
} from "@/lib/locations/main-warehouse-constants";
import type { AuthContext } from "@/lib/auth/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { serviceFail, serviceOk, type ServiceResult } from "@/lib/utils/service-result";
export {
  MAIN_WAREHOUSE_CODE,
  MAIN_WAREHOUSE_NAME,
  MAIN_WAREHOUSE_TIMEZONE,
} from "@/lib/locations/main-warehouse-constants";

export type MainWarehouseLocation = {
  id: string;
  code: string | null;
  name: string | null;
  timezone: string | null;
  is_active: boolean;
};

type WarehouseLookupResult = {
  data: MainWarehouseLocation | null;
  error: {
    message: string;
    code?: string | null;
  } | null;
};

function normalizeWarehouseValue(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

export function isMainWarehouseLocation(
  location: Pick<MainWarehouseLocation, "code" | "name"> | null | undefined,
) {
  if (!location) {
    return false;
  }

  return (
    normalizeWarehouseValue(location.code) === normalizeWarehouseValue(MAIN_WAREHOUSE_CODE) ||
    normalizeWarehouseValue(location.name) === normalizeWarehouseValue(MAIN_WAREHOUSE_NAME)
  );
}

async function readLocationByCode(): Promise<WarehouseLookupResult> {
  const result = await supabaseAdmin
    .from("locations")
    .select("id, code, name, timezone, is_active")
    .eq("code", MAIN_WAREHOUSE_CODE)
    .maybeSingle<MainWarehouseLocation>();

  return {
    data: result.data,
    error: result.error,
  };
}

async function readLocationByName(): Promise<WarehouseLookupResult> {
  const result = await supabaseAdmin
    .from("locations")
    .select("id, code, name, timezone, is_active")
    .eq("name", MAIN_WAREHOUSE_NAME)
    .order("created_at", { ascending: true })
    .limit(1);

  return {
    data: (result.data?.[0] as MainWarehouseLocation | undefined) ?? null,
    error: result.error,
  };
}

async function reactivateLocation(locationId: string) {
  const result = await supabaseAdmin
    .from("locations")
    .update({ is_active: true })
    .eq("id", locationId)
    .select("id, code, name, timezone, is_active")
    .single<MainWarehouseLocation>();

  return result;
}

async function createMainWarehouseLocation() {
  return supabaseAdmin
    .from("locations")
    .insert({
      code: MAIN_WAREHOUSE_CODE,
      name: MAIN_WAREHOUSE_NAME,
      timezone: MAIN_WAREHOUSE_TIMEZONE,
      is_active: true,
    })
    .select("id, code, name, timezone, is_active")
    .single<MainWarehouseLocation>();
}

export async function ensureMainWarehouseForContext(
  context: AuthContext,
): Promise<ServiceResult<MainWarehouseLocation>> {
  let existing = await readLocationByCode();

  if (existing.error) {
    return serviceFail(400, existing.error.message);
  }

  if (!existing.data) {
    existing = await readLocationByName();
    if (existing.error) {
      return serviceFail(400, existing.error.message);
    }
  }

  let location = existing.data;

  if (!location) {
    const created = await createMainWarehouseLocation();
    if (created.error) {
      if (created.error.code === "23505") {
        const retry = await readLocationByCode();
        if (retry.error) {
          return serviceFail(400, retry.error.message);
        }
        location = retry.data;
      } else {
        return serviceFail(400, created.error.message);
      }
    } else {
      location = created.data;
    }
  }

  if (!location) {
    return serviceFail(500, "Failed to resolve the main warehouse.");
  }

  if (!location.is_active) {
    const reactivated = await reactivateLocation(location.id);
    if (reactivated.error) {
      return serviceFail(400, reactivated.error.message);
    }
    location = reactivated.data;
  }

  if (context.profile.role !== "admin") {
    const { error: accessError } = await supabaseAdmin
      .from("user_location_access")
      .upsert(
        {
          user_id: context.user.id,
          location_id: location.id,
        },
        { onConflict: "user_id,location_id" },
      );

    if (accessError) {
      return serviceFail(400, accessError.message);
    }

    if (!context.locationIds.includes(location.id)) {
      context.locationIds.push(location.id);
    }
  }

  return serviceOk(location);
}
