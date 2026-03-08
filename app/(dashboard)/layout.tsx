import { ReactNode } from "react";
import { redirect } from "next/navigation";

import { DashboardNav } from "@/components/layout/dashboard-nav";
import { DashboardSessionProvider } from "@/components/layout/dashboard-session-provider";
import { DashboardTopbar } from "@/components/layout/dashboard-topbar";
import { getAuthContext } from "@/lib/auth/permissions";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    redirect("/login");
  }

  const { data: companySetting, error: companySettingError } = await context.supabase
    .from("system_settings")
    .select("value_text")
    .eq("key", "company_name")
    .maybeSingle();
  if (companySettingError) {
    console.warn(`[SETTINGS] Failed to load company name: ${companySettingError.message}`);
  }

  const normalizedCompanyName = (companySetting?.value_text ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const companyName = normalizedCompanyName || "ICE";
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
      }}
    >
      <div className="ims-page">
        <DashboardTopbar
          companyName={companyName}
          displayName={displayName}
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
