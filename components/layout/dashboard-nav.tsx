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
      <div className="mb-7 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-white/65">IMS</p>
        <p className="text-sm font-semibold text-white">Inventory Console</p>
      </div>

      <nav className="space-y-1.5">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              className={cn(
                "group relative block rounded-xl border px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "border-[var(--brand-accent-soft)] bg-white text-[var(--text-strong)] shadow-[0_6px_16px_rgba(0,0,0,0.18)]"
                  : "border-transparent text-white/[0.82] hover:border-white/10 hover:bg-white/[0.06] hover:text-white",
              )}
            >
              <span
                className={cn(
                  "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full transition",
                  active ? "bg-[var(--brand-accent)]" : "bg-transparent",
                )}
              />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <form action="/api/auth/logout" method="post" className="mt-8">
        <button
          type="submit"
          className="h-11 w-full rounded-xl border border-white/18 bg-transparent px-3 text-left text-sm font-medium text-white/[0.88] transition hover:bg-white/[0.06]"
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
        "fixed inset-y-0 left-0 z-50 w-[17rem] border-r border-white/10 bg-[#0f131a] p-4 text-white transition-transform duration-200 md:hidden",
        open ? "translate-x-0" : "-translate-x-full",
      ),
    [open],
  );

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-[#0f131a] px-4 text-white md:hidden">
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.18em] text-white/70">IMS</p>
          <p className="text-sm font-semibold">Inventory Console</p>
        </div>
        <button
          type="button"
          className="h-10 rounded-xl border border-white/20 px-3 text-sm font-medium"
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
          className="fixed inset-0 z-40 bg-black/55 md:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside className={drawerClass}>
        <NavContent onNavigate={() => setOpen(false)} />
      </aside>

      <aside className="sticky top-0 hidden h-dvh w-[16rem] shrink-0 border-r border-white/10 bg-[#0f131a] p-4 text-white md:block">
        <NavContent />
      </aside>
    </>
  );
}
