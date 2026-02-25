"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils/cn";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/locations", label: "Locations" },
  { href: "/products", label: "Products" },
  { href: "/inventory", label: "Inventory" },
  { href: "/transactions", label: "Transactions" },
  { href: "/transfers", label: "Transfers" },
  { href: "/alerts", label: "Alerts" },
  { href: "/reports", label: "Reports" },
  { href: "/admin/users", label: "Users" },
];

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
        <p className="text-xs uppercase tracking-wider text-cyan-300">IMS</p>
        <p className="text-sm font-semibold">Inventory Console</p>
      </div>

      <nav className="space-y-1">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              className={cn(
                "block rounded-md px-3 py-2 text-sm transition",
                active
                  ? "bg-slate-700 text-white"
                  : "text-slate-200 hover:bg-slate-800",
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <form action="/api/auth/logout" method="post" className="mt-8">
        <button
          type="submit"
          className="h-11 w-full rounded-md border border-slate-700 px-3 text-left text-sm hover:bg-slate-800"
        >
          Logout
        </button>
      </form>
    </>
  );
}

export function DashboardNav() {
  const [open, setOpen] = useState(false);

  const drawerClass = useMemo(
    () =>
      cn(
        "fixed inset-y-0 left-0 z-50 w-[17rem] border-r border-slate-200 bg-slate-950 p-4 text-slate-100 transition-transform duration-200 md:hidden",
        open ? "translate-x-0" : "-translate-x-full",
      ),
    [open],
  );

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-slate-950 px-4 text-slate-100 md:hidden">
        <div>
          <p className="text-xs uppercase tracking-wider text-cyan-300">IMS</p>
          <p className="text-sm font-semibold">Inventory Console</p>
        </div>
        <button
          type="button"
          className="h-10 rounded-md border border-slate-700 px-3 text-sm"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label="Toggle navigation menu"
        >
          Menu
        </button>
      </header>

      {open ? (
        <button
          type="button"
          aria-label="Close menu overlay"
          className="fixed inset-0 z-40 bg-slate-900/50 md:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside className={drawerClass}>
        <NavContent onNavigate={() => setOpen(false)} />
      </aside>

      <aside className="sticky top-0 hidden h-dvh w-[16rem] shrink-0 border-r border-slate-200 bg-slate-950 p-4 text-slate-100 md:block">
        <NavContent />
      </aside>
    </>
  );
}
