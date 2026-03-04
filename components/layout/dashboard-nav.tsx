"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils/cn";

const links: Array<{ href: string; label: string; prefixMatch?: boolean }> = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/master", label: "Master", prefixMatch: true },
  { href: "/inventory", label: "Inventory" },
  { href: "/transactions", label: "Transactions", prefixMatch: true },
  { href: "/alerts", label: "Alerts" },
  { href: "/reports", label: "Reports" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/settings", label: "Settings" },
];

function NavContent({
  onNavigate,
  companyName,
}: {
  onNavigate?: () => void;
  companyName: string;
}) {
  const pathname = usePathname();

  return (
    <>
      <div className="mb-[var(--space-6)] rounded-[var(--radius-xl)] border border-[var(--line)] bg-[var(--surface-soft)] px-[var(--space-4)] py-[var(--space-4)]">
        <p className="text-[0.7rem] uppercase tracking-[0.16em] text-[var(--text-muted)]">ICE</p>
        <p className="text-sm font-semibold text-[var(--text-strong)]">{companyName}</p>
      </div>

      <nav className="space-y-[var(--space-2)]">
        {links.map((link) => {
          const active = link.prefixMatch
            ? pathname === link.href || pathname.startsWith(`${link.href}/`)
            : pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              className={cn(
                "group relative block rounded-[var(--radius-lg)] border px-[var(--space-4)] py-[var(--space-3)] text-sm font-medium transition",
                active
                  ? "border-[color:color-mix(in_srgb,var(--brand-primary)_36%,var(--line)_64%)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary-hover)] shadow-[var(--shadow-sm)]"
                  : "border-transparent bg-transparent text-[var(--text-strong)] hover:border-[var(--line)] hover:bg-[var(--surface-muted)]",
              )}
            >
              <span
                className={cn(
                  "absolute inset-y-1 start-[var(--space-2)] w-[0.18rem] rounded-full transition",
                  active ? "bg-[var(--brand-primary)]" : "bg-transparent",
                )}
              />
              <span className="ps-[var(--space-2)]">{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <form action="/api/auth/logout" method="post" className="mt-[var(--space-7)]">
        <button
          type="submit"
          className="h-11 w-full rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] px-[var(--space-4)] text-left text-sm font-medium text-[var(--text-strong)] transition hover:bg-[var(--surface-muted)]"
        >
          Logout
        </button>
      </form>
    </>
  );
}

export function DashboardNav({ companyName }: { companyName: string }) {
  const [open, setOpen] = useState(false);

  const drawerClass = useMemo(
    () =>
      cn(
        "fixed inset-y-0 start-0 z-50 w-[18rem] border-e border-[var(--line)] bg-[var(--surface)] p-[var(--space-4)] text-[var(--text-strong)] shadow-[var(--shadow-lg)] transition-transform duration-200 md:hidden",
        open ? "translate-x-0" : "-translate-x-full",
      ),
    [open],
  );

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-[var(--space-4)] text-[var(--text-strong)] md:hidden">
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.16em] text-[var(--text-muted)]">ICE</p>
          <p className="text-sm font-semibold">{companyName}</p>
        </div>
        <button
          type="button"
          className="h-10 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface-soft)] px-[var(--space-4)] text-sm font-medium"
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
          className="fixed inset-0 z-40 bg-black/45 md:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside className={drawerClass}>
        <NavContent onNavigate={() => setOpen(false)} companyName={companyName} />
      </aside>

      <aside className="sticky top-0 hidden h-dvh w-[17rem] shrink-0 border-e border-[var(--line)] bg-[var(--surface)] p-[var(--space-4)] text-[var(--text-strong)] md:block">
        <NavContent companyName={companyName} />
      </aside>
    </>
  );
}
