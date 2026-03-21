import { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardNav } from "@/components/layout/dashboard-nav";
import { DashboardSessionProvider } from "@/components/layout/dashboard-session-provider";
import { DashboardTopbar } from "@/components/layout/dashboard-topbar";
import { getAuthContext } from "@/lib/auth/permissions";
import {
  DEFAULT_SYSTEM_CURRENCY_CODE,
  SYSTEM_CURRENCY_SETTING_KEY,
  normalizeSystemCurrencyCode,
} from "@/lib/settings/system-currency";
import { DEFAULT_THEME_MODE, THEME_COOKIE_NAME, normalizeThemeMode } from "@/lib/theme";

const COMPANY_NAME_KEY = "company_name";
const DEFAULT_COMPANY_NAME = "ICE";

function normalizeCompanyName(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const initialTheme = normalizeThemeMode(
    cookieStore.get(THEME_COOKIE_NAME)?.value ?? DEFAULT_THEME_MODE,
  );

  const { data: settingsRows, error: settingsError } = await context.supabase
    .from("system_settings")
    .select("key, value_text")
    .in("key", [COMPANY_NAME_KEY, SYSTEM_CURRENCY_SETTING_KEY]);
  if (settingsError) {
    console.warn(`[SETTINGS] Failed to load system settings: ${settingsError.message}`);
  }

  const settingsByKey = new Map(
    ((settingsRows ?? []) as Array<{ key: string; value_text: string | null }>).map((row) => [
      row.key,
      row.value_text,
    ]),
  );
  const companyName =
    normalizeCompanyName(settingsByKey.get(COMPANY_NAME_KEY)) || DEFAULT_COMPANY_NAME;
  const currencyCode = settingsError
    ? DEFAULT_SYSTEM_CURRENCY_CODE
    : normalizeSystemCurrencyCode(settingsByKey.get(SYSTEM_CURRENCY_SETTING_KEY));
  const displayName =
    context.profile.full_name.trim() ||
    context.user.email?.trim() ||
    companyName;

  return (
    <DashboardSessionProvider
      value={{
        userId: context.user.id,
        role: context.profile.role,
        capabilities: context.capabilities,
        locationIds: context.locationIds,
        companyName,
        currencyCode,
      }}
    >
      <div className="ims-page">
        <DashboardTopbar
          companyName={companyName}
          displayName={displayName}
          initialTheme={initialTheme}
          role={context.profile.role}
        />
        <div className="ims-dashboard-shell">
          <div className="flex min-h-dvh w-full flex-col md:flex-row">
            <DashboardNav companyName={companyName} />
            <main className="ims-content">
              <div className="space-y-4 lg:space-y-5 xl:space-y-7">{children}</div>
            </main>
          </div>
        </div>
      </div>
    </DashboardSessionProvider>
  );
}
