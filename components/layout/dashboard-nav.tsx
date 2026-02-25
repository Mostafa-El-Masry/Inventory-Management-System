import Link from "next/link";

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

export function DashboardNav() {
  return (
    <aside className="sticky top-0 h-screen w-full max-w-60 shrink-0 border-r border-slate-200 bg-slate-950 p-4 text-slate-100">
      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
        <p className="text-xs uppercase tracking-wider text-cyan-300">IMS</p>
        <p className="text-sm font-semibold">Inventory Console</p>
      </div>

      <nav className="space-y-1">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="block rounded-md px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <form action="/api/auth/logout" method="post" className="mt-8">
        <button
          type="submit"
          className="w-full rounded-md border border-slate-700 px-3 py-2 text-left text-sm hover:bg-slate-800"
        >
          Logout
        </button>
      </form>
    </aside>
  );
}
