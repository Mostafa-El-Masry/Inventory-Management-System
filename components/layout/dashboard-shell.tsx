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
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex w-full max-w-[1600px]">
        <DashboardNav />
        <main className="flex-1 p-6 md:p-8">
          <header className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight">{heading}</h1>
            {subheading ? (
              <p className="mt-1 text-sm text-slate-600">{subheading}</p>
            ) : null}
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
