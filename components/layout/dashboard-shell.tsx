import { ReactNode } from "react";

import { DashboardNav } from "@/components/layout/dashboard-nav";

interface DashboardShellProps {
  children: ReactNode;
  heading: string;
  subheading?: string;
}

export function DashboardShell({
  children,
  heading,
  subheading,
}: DashboardShellProps) {
  return (
    <div className="ims-page">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1720px] flex-col md:flex-row">
        <DashboardNav />
        <main className="ims-content">
          <header className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight">{heading}</h1>
            {subheading ? (
              <p className="mt-1 text-sm text-[var(--text-muted)]">{subheading}</p>
            ) : null}
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
