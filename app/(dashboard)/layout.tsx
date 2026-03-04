import { ReactNode } from "react";
import { redirect } from "next/navigation";

import { DashboardNav } from "@/components/layout/dashboard-nav";
import { DashboardSessionProvider } from "@/components/layout/dashboard-session-provider";
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
        <div className="mx-auto flex min-h-dvh w-full max-w-[107.5rem] flex-col md:flex-row">
          <DashboardNav companyName={companyName} />
          <main className="ims-content">{children}</main>
        </div>
      </div>
    </DashboardSessionProvider>
  );
}
