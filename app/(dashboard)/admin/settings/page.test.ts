import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFullMasterPermissions } from "@/lib/master-permissions";

const { useDashboardSessionMock } = vi.hoisted(() => ({
  useDashboardSessionMock: vi.fn(),
}));

vi.mock("@/components/layout/dashboard-session-provider", () => ({
  useDashboardSession: useDashboardSessionMock,
}));

import AdminSettingsPage from "@/app/(dashboard)/admin/settings/page";

function renderPage(initialTab?: "branding" | "test") {
  return renderToStaticMarkup(
    React.createElement(AdminSettingsPage, {
      initialTab,
    }),
  );
}

describe("AdminSettingsPage", () => {
  beforeEach(() => {
    useDashboardSessionMock.mockReset();
  });

  it("shows the Test tab for admins", () => {
    useDashboardSessionMock.mockReturnValue({
      userId: "admin-user",
      role: "admin",
      capabilities: {
        canManageUsers: true,
        canCreateProductMaster: true,
        canEditProductMaster: true,
        canArchiveProducts: true,
        canManageLocations: true,
        canArchiveLocations: true,
        canManageSuppliers: true,
        canManageSystemSettings: true,
        canRecordSupplierPayments: true,
        master: createFullMasterPermissions(),
      },
      locationIds: [],
      companyName: "ICE",
    });

    const markup = renderPage();

    expect(markup).toContain("Branding");
    expect(markup).toContain("Test");
  });

  it("renders one-click test cards instead of manual inputs", () => {
    useDashboardSessionMock.mockReturnValue({
      userId: "admin-user",
      role: "admin",
      capabilities: {
        canManageUsers: true,
        canCreateProductMaster: true,
        canEditProductMaster: true,
        canArchiveProducts: true,
        canManageLocations: true,
        canArchiveLocations: true,
        canManageSuppliers: true,
        canManageSystemSettings: true,
        canRecordSupplierPayments: true,
        master: createFullMasterPermissions(),
      },
      locationIds: [],
      companyName: "ICE",
    });

    const markup = renderPage();

    expect(markup).not.toContain("Select supplier");
    expect(markup).not.toContain("Supplier invoice number");
    expect(markup).not.toContain("Select product");
    expect(markup).not.toContain("Initial Inventory Load");
  });

  it("renders the danger zone on the Test tab for admins with the clear button disabled by default", () => {
    useDashboardSessionMock.mockReturnValue({
      userId: "admin-user",
      role: "admin",
      capabilities: {
        canManageUsers: true,
        canCreateProductMaster: true,
        canEditProductMaster: true,
        canArchiveProducts: true,
        canManageLocations: true,
        canArchiveLocations: true,
        canManageSuppliers: true,
        canManageSystemSettings: true,
        canRecordSupplierPayments: true,
        master: createFullMasterPermissions(),
      },
      locationIds: [],
      companyName: "ICE",
    });

    const markup = renderPage("test");

    expect(markup).toContain("Danger Zone");
    expect(markup).toContain("Clear Transaction Data");
    expect(markup).toContain("CLEAR TRANSACTIONS");
    expect(markup).toMatch(/button[^>]*disabled[^>]*>Clear Transaction Data<\/button>/);
  });

  it("hides the Test tab for non-admin users", () => {
    useDashboardSessionMock.mockReturnValue({
      userId: "staff-user",
      role: "staff",
      capabilities: {
        canManageUsers: false,
        canCreateProductMaster: false,
        canEditProductMaster: false,
        canArchiveProducts: false,
        canManageLocations: false,
        canArchiveLocations: false,
        canManageSuppliers: false,
        canManageSystemSettings: false,
        canRecordSupplierPayments: false,
        master: createFullMasterPermissions(),
      },
      locationIds: [],
      companyName: "ICE",
    });

    const markup = renderPage();

    expect(markup).toContain("Branding");
    expect(markup).not.toContain(">Test<");
  });
});
