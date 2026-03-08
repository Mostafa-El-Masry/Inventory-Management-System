"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

const tabs = [
  { href: "/master/products", label: "Products" },
  { href: "/master/categories", label: "Categories" },
  { href: "/master/subcategories", label: "Subcategories" },
  { href: "/master/locations", label: "Locations" },
  { href: "/master/suppliers", label: "Suppliers" },
];

export default function MasterLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2 md:hidden">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "rounded-[var(--radius-md)] border px-3 py-2 text-sm font-medium transition",
                active
                  ? "border-[color:color-mix(in_srgb,var(--brand-primary)_36%,var(--line)_64%)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary-hover)]"
                  : "border-[var(--line)] bg-[var(--surface)] text-[var(--text-strong)] hover:bg-[var(--surface-muted)]",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
