"use client";

import { ReactNode, createContext, useContext } from "react";

import type { SystemCurrencyCode } from "@/lib/settings/system-currency";
import { AuthCapabilities } from "@/lib/types/api";
import { Role } from "@/lib/types/domain";

export type DashboardSession = {
  userId: string;
  role: Role;
  capabilities: AuthCapabilities;
  locationIds: string[];
  companyName: string;
  currencyCode: SystemCurrencyCode;
};

const DashboardSessionContext = createContext<DashboardSession | null>(null);

export function DashboardSessionProvider({
  value,
  children,
}: {
  value: DashboardSession;
  children: ReactNode;
}) {
  return (
    <DashboardSessionContext.Provider value={value}>
      {children}
    </DashboardSessionContext.Provider>
  );
}

export function useDashboardSession() {
  const session = useContext(DashboardSessionContext);
  if (!session) {
    throw new Error("useDashboardSession must be used within DashboardSessionProvider.");
  }
  return session;
}
