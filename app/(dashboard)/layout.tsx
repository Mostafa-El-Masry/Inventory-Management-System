import { ReactNode } from "react";
import { redirect } from "next/navigation";

import { DashboardNav } from "@/components/layout/dashboard-nav";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="ims-page">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1720px] flex-col md:flex-row">
        <DashboardNav />
        <main className="ims-content">{children}</main>
      </div>
    </div>
  );
}
