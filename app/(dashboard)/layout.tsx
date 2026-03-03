import { ReactNode } from "react";
import { redirect } from "next/navigation";

import { DashboardNav } from "@/components/layout/dashboard-nav";
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

  return (
    <div className="ims-page">
      <div className="mx-auto flex min-h-dvh w-full max-w-[107.5rem] flex-col md:flex-row">
        <DashboardNav />
        <main className="ims-content">{children}</main>
      </div>
    </div>
  );
}
