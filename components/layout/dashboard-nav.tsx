"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, type SVGProps, useEffect, useState } from "react";

import { cn } from "@/lib/utils/cn";

type NavItem = {
  href: string;
  label: string;
};

type IconComponent = (props: SVGProps<SVGSVGElement>) => ReactNode;

type NavLink = {
  href: string;
  label: string;
  icon: IconComponent;
  items: NavItem[];
  prefixMatch?: boolean;
};

const SIDEBAR_STORAGE_KEY = "ims:dashboard-secondary-nav-collapsed";

function SvgIcon({
  children,
  ...props
}: SVGProps<SVGSVGElement> & {
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

function DashboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgIcon {...props}>
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </SvgIcon>
  );
}

function MasterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgIcon {...props}>
      <path d="M12 4 4.5 8 12 12l7.5-4L12 4Z" />
      <path d="M4.5 12 12 16l7.5-4" />
      <path d="M4.5 16 12 20l7.5-4" />
    </SvgIcon>
  );
}

function InventoryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgIcon {...props}>
      <path d="M4 8.5 12 4l8 4.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8.5Z" />
      <path d="M4 8.5 12 13l8-4.5" />
      <path d="M12 13V20" />
    </SvgIcon>
  );
}

function TransactionsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgIcon {...props}>
      <path d="M7 7h11" />
      <path d="m14 4 4 3-4 3" />
      <path d="M17 17H6" />
      <path d="m10 14-4 3 4 3" />
    </SvgIcon>
  );
}

function AlertsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgIcon {...props}>
      <path d="M9 18h6" />
      <path d="M10.5 21h3" />
      <path d="M6.5 9a5.5 5.5 0 1 1 11 0c0 5 2 6 2 6h-15s2-1 2-6" />
    </SvgIcon>
  );
}

function ReportsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgIcon {...props}>
      <path d="M5 19V9" />
      <path d="M12 19V5" />
      <path d="M19 19v-8" />
      <path d="M4 19h16" />
    </SvgIcon>
  );
}

function UsersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgIcon {...props}>
      <path d="M16 20v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1" />
      <circle cx="10" cy="8" r="3" />
      <path d="M20 20v-1a4 4 0 0 0-3-3.87" />
      <path d="M16 5.13a3 3 0 0 1 0 5.74" />
    </SvgIcon>
  );
}

function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 0 1 0-4h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9V4a2 2 0 0 1 4 0v.2a1 1 0 0 0 .7.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6H20a2 2 0 0 1 0 4h-.2a1 1 0 0 0-.9.7Z" />
    </SvgIcon>
  );
}

function PanelIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgIcon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9 4v16" />
    </SvgIcon>
  );
}

function CollapseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgIcon {...props}>
      <path d="m14 8-4 4 4 4" />
    </SvgIcon>
  );
}

function ExpandIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgIcon {...props}>
      <path d="m10 8 4 4-4 4" />
    </SvgIcon>
  );
}

function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgIcon {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </SvgIcon>
  );
}

function LogoutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgIcon {...props}>
      <path d="M10 17v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-6a2 2 0 0 0-2 2v1" />
      <path d="M15 12H4" />
      <path d="m8 8-4 4 4 4" />
    </SvgIcon>
  );
}

const links: NavLink[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: DashboardIcon,
    items: [{ href: "/dashboard", label: "Overview" }],
  },
  {
    href: "/master",
    label: "Master",
    prefixMatch: true,
    icon: MasterIcon,
    items: [
      { href: "/master/products", label: "Products" },
      { href: "/master/categories", label: "Categories" },
      { href: "/master/subcategories", label: "Subcategories" },
      { href: "/master/locations", label: "Locations" },
      { href: "/master/suppliers", label: "Suppliers" },
    ],
  },
  {
    href: "/inventory",
    label: "Inventory",
    icon: InventoryIcon,
    items: [{ href: "/inventory", label: "Stock" }],
  },
  {
    href: "/transactions",
    label: "Transactions",
    prefixMatch: true,
    icon: TransactionsIcon,
    items: [
      { href: "/transactions/purchase", label: "Purchase" },
      { href: "/transactions/purchase-return", label: "Purchase Return" },
      { href: "/transactions/opening-stock", label: "Opening Stock" },
      { href: "/transactions/stock-adjustment", label: "Stock Adjustment" },
      { href: "/transactions/transfers", label: "Transfers" },
    ],
  },
  {
    href: "/alerts",
    label: "Alerts",
    icon: AlertsIcon,
    items: [{ href: "/alerts", label: "Alerts" }],
  },
  {
    href: "/reports",
    label: "Reports",
    icon: ReportsIcon,
    items: [{ href: "/reports", label: "Reports" }],
  },
  {
    href: "/admin/users",
    label: "Users",
    icon: UsersIcon,
    items: [{ href: "/admin/users", label: "Users" }],
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: SettingsIcon,
    items: [{ href: "/admin/settings", label: "Settings" }],
  },
];

function isLinkActive(pathname: string, link: Pick<NavLink, "href" | "prefixMatch">) {
  return link.prefixMatch
    ? pathname === link.href || pathname.startsWith(`${link.href}/`)
    : pathname === link.href;
}

function MobileNavContent({
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
        <p className="text-[0.88rem] font-semibold text-[var(--text-strong)] sm:text-sm">{companyName}</p>
      </div>

      <nav className="space-y-[var(--space-2)]">
        {links.map((link) => {
          const Icon = link.icon;
          const active = isLinkActive(pathname, link);
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              className={cn(
                "group relative flex items-center gap-[var(--space-2)] rounded-[var(--radius-lg)] border px-[var(--space-3)] py-[var(--space-2)] text-[0.84rem] font-semibold transition sm:gap-[var(--space-3)] sm:rounded-[1.15rem] sm:px-[var(--space-4)] sm:py-[var(--space-3)] sm:text-[clamp(0.9rem,0.87rem+0.08vw,0.98rem)]",
                active
                  ? "border-transparent bg-[color:color-mix(in_srgb,var(--brand-primary)_12%,var(--surface)_88%)] text-[var(--brand-primary-hover)]"
                  : "border-transparent bg-transparent text-[var(--text-strong)] hover:bg-[var(--surface-muted)]",
              )}
              aria-current={active ? "page" : undefined}
            >
              <span
                className={cn(
                  "absolute inset-y-1 start-[var(--space-2)] w-[0.18rem] rounded-full transition",
                  active ? "bg-[var(--brand-primary)]" : "bg-transparent",
                )}
              />
              <Icon className="ms-[var(--space-1)] h-4.5 w-4.5 shrink-0 sm:ms-[var(--space-2)] sm:h-5 sm:w-5" />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <form action="/api/auth/logout" method="post" className="mt-[var(--space-7)]">
        <button
          type="submit"
          className="ims-control-lg w-full rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] px-[var(--control-px)] text-left text-[var(--control-font-size)] font-medium text-[var(--text-strong)] transition hover:bg-[var(--surface-muted)]"
        >
          Logout
        </button>
      </form>
    </>
  );
}

function DesktopRail({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-[var(--dashboard-topbar-h)] hidden h-[calc(100dvh-var(--dashboard-topbar-h))] w-[4.1rem] shrink-0 border-e border-[var(--line)] bg-[var(--surface)] text-[var(--text-strong)] md:flex md:flex-col xl:w-[5.5rem]">
      <div className="px-[var(--space-1)] pt-[var(--space-3)] xl:px-[var(--space-2)] xl:pt-[var(--space-4)]">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-h-[3.35rem] w-full flex-col items-center justify-center gap-0.5 rounded-[var(--radius-lg)] px-1 py-1 text-[var(--text-muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text-strong)] xl:min-h-[4.35rem] xl:gap-1 xl:rounded-[var(--radius-xl)] xl:py-2"
          aria-label={collapsed ? "Expand navigation panel" : "Collapse navigation panel"}
          title={collapsed ? "Expand navigation panel" : "Collapse navigation panel"}
        >
          <span className="relative flex items-center justify-center">
            <PanelIcon className="h-4 w-4 xl:h-5 xl:w-5" />
            {collapsed ? (
              <ExpandIcon className="absolute -end-3 h-2.5 w-2.5 rounded-full bg-[var(--surface)] text-[var(--brand-primary-hover)] xl:-end-4 xl:h-3.5 xl:w-3.5" />
            ) : (
              <CollapseIcon className="absolute -end-3 h-2.5 w-2.5 rounded-full bg-[var(--surface)] text-[var(--brand-primary-hover)] xl:-end-4 xl:h-3.5 xl:w-3.5" />
            )}
          </span>
          <span className="text-center text-[0.5rem] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)] xl:text-[0.62rem] xl:tracking-[0.06em]">
            Menu
          </span>
        </button>
      </div>

      <nav className="mt-[var(--space-3)] flex-1 space-y-[var(--space-1)] px-[var(--space-1)] xl:mt-[var(--space-4)] xl:space-y-[var(--space-2)] xl:px-[var(--space-2)]">
        {links.map((link) => {
          const Icon = link.icon;
          const active = isLinkActive(pathname, link);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex min-h-[3.7rem] w-full flex-col items-center justify-center gap-0.5 rounded-[var(--radius-lg)] px-1 py-1 text-[var(--text-strong)] transition xl:min-h-[4.9rem] xl:gap-1 xl:rounded-[var(--radius-xl)] xl:py-2",
                active
                  ? "bg-[color:color-mix(in_srgb,var(--brand-primary)_12%,var(--surface)_88%)] text-[var(--brand-primary-hover)]"
                  : "bg-transparent hover:bg-[var(--surface-muted)]",
              )}
              aria-current={active ? "page" : undefined}
              aria-label={link.label}
              title={link.label}
            >
              <Icon className="h-4 w-4 xl:h-5 xl:w-5" />
              <span className="text-center text-[0.52rem] font-semibold leading-[1.05] text-current xl:text-[0.67rem] xl:leading-[1.15]">
                {link.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <form action="/api/auth/logout" method="post" className="px-[var(--space-1)] pb-[var(--space-3)] xl:px-[var(--space-2)] xl:pb-[var(--space-4)]">
        <button
          type="submit"
          className="flex min-h-[3.7rem] w-full flex-col items-center justify-center gap-0.5 rounded-[var(--radius-lg)] px-1 py-1 text-[var(--text-muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text-strong)] xl:min-h-[4.9rem] xl:gap-1 xl:rounded-[var(--radius-xl)] xl:py-2"
          aria-label="Logout"
          title="Logout"
        >
          <LogoutIcon className="h-4 w-4 xl:h-5 xl:w-5" />
          <span className="text-center text-[0.52rem] font-semibold leading-[1.05] text-current xl:text-[0.67rem] xl:leading-[1.15]">
            Logout
          </span>
        </button>
      </form>
    </aside>
  );
}

function SectionPanel({
  companyName,
  section,
}: {
  companyName: string;
  section: NavLink;
}) {
  const pathname = usePathname();
  const SectionIcon = section.icon;
  const activeItem =
    section.items.find(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    ) ?? section.items[0];

  return (
    <>
      <div className="mb-[var(--space-4)] rounded-[1.15rem] border border-[var(--line)] bg-[var(--surface-soft)] px-[var(--space-3)] py-[var(--space-3)] lg:mb-[var(--space-5)] lg:px-[var(--space-2)] lg:py-[var(--space-2)] xl:mb-[var(--space-5)] xl:rounded-[var(--radius-xl)] xl:px-[var(--space-3)] xl:py-[var(--space-3)]">
        <p className="text-[0.7rem] uppercase tracking-[0.16em] text-[var(--text-muted)]">ICE</p>
        <p className="mt-[var(--space-1)] text-[0.82rem] font-semibold text-[var(--text-strong)] lg:text-[0.8rem] xl:mt-[var(--space-1)] xl:text-[0.88rem]">{companyName}</p>

        <div className="mt-[var(--space-3)] flex items-center gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-[var(--space-2)] py-[var(--space-2)] lg:mt-[var(--space-2)] lg:gap-[var(--space-1)] lg:px-[var(--space-1)] lg:py-[var(--space-2)] xl:mt-[var(--space-3)] xl:gap-[var(--space-2)] xl:rounded-[var(--radius-lg)] xl:px-[var(--space-2)] xl:py-[var(--space-2)]">
          <span className="flex ims-icon-btn-md shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary-hover)] xl:h-[var(--icon-btn-lg)] xl:w-[var(--icon-btn-lg)] xl:rounded-[var(--radius-lg)]">
            <SectionIcon className="h-4 w-4 xl:h-5 xl:w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[0.82rem] font-semibold text-[var(--text-strong)] lg:text-[0.8rem] xl:text-[0.9rem]">{section.label}</p>
            <p className="text-[0.72rem] text-[var(--text-muted)] lg:text-[0.68rem] xl:text-[0.72rem]">Section navigation</p>
          </div>
        </div>
      </div>

      <div>
        <p className="mb-[var(--space-2)] px-[var(--space-1)] text-[0.6rem] uppercase tracking-[0.1em] text-[var(--text-muted)] lg:mb-[var(--space-2)] lg:text-[0.58rem] xl:mb-[var(--space-3)] xl:text-[0.64rem] xl:tracking-[0.12em]">
          Pages
        </p>

        <nav className="space-y-[var(--space-2)]">
          {section.items.map((item) => {
            const active = activeItem.href === item.href;

            return (
              <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative block rounded-[var(--radius-md)] border px-[var(--space-3)] py-[var(--space-2)] text-[0.82rem] font-semibold transition lg:px-[var(--space-2)] lg:py-[var(--space-2)] lg:text-[0.78rem] xl:rounded-[1.15rem] xl:px-[var(--space-3)] xl:py-[var(--space-2)] xl:text-[clamp(0.84rem,0.82rem+0.08vw,0.92rem)]",
                active
                  ? "border-transparent bg-[color:color-mix(in_srgb,var(--brand-primary)_12%,var(--surface)_88%)] text-[var(--brand-primary-hover)]"
                  : "border-transparent bg-transparent text-[var(--text-strong)] hover:bg-[var(--surface-muted)]",
                )}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className={cn(
                    "absolute inset-y-1 start-[var(--space-2)] w-[0.18rem] rounded-full transition",
                    active ? "bg-[var(--brand-primary)]" : "bg-transparent",
                  )}
                />
                <span className="ps-[var(--space-2)]">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}

export function DashboardNav({ companyName }: { companyName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hasLoadedPreference, setHasLoadedPreference] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");
    } catch {
      setCollapsed(false);
    } finally {
      setHasLoadedPreference(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedPreference) {
      return;
    }

    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    } catch {
      return;
    }
  }, [collapsed, hasLoadedPreference]);

  const activeLink = links.find((link) => isLinkActive(pathname, link)) ?? links[0];
  const drawerClass = cn(
    "fixed inset-y-0 start-0 z-50 w-[16rem] border-e border-[var(--line)] bg-[var(--surface)] p-[var(--space-3)] text-[var(--text-strong)] shadow-[var(--shadow-lg)] transition-transform duration-200 sm:w-[17rem] sm:p-[var(--space-4)] md:hidden",
    open ? "translate-x-0" : "-translate-x-full",
  );

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-[var(--space-3)] text-[var(--text-strong)] md:hidden">
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.16em] text-[var(--text-muted)]">ICE</p>
          <p className="text-[0.88rem] font-semibold">{companyName}</p>
        </div>
        <button
          type="button"
          className="flex ims-control-md items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface-soft)] px-[var(--control-px)] text-[var(--control-font-size)] font-medium"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label="Toggle navigation menu"
        >
          <MenuIcon className="h-4 w-4" />
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
        <MobileNavContent onNavigate={() => setOpen(false)} companyName={companyName} />
      </aside>

      <div className="hidden shrink-0 md:flex">
        <DesktopRail
          collapsed={collapsed}
          onToggle={() => setCollapsed((value) => !value)}
        />

        <aside
          className={cn(
            "sticky top-[var(--dashboard-topbar-h)] hidden h-[calc(100dvh-var(--dashboard-topbar-h))] shrink-0 overflow-hidden bg-[var(--surface)] text-[var(--text-strong)] transition-[width,padding,opacity,border-color] duration-200 md:block",
            collapsed
              ? "w-0 border-e-0 px-0 py-0 opacity-0"
              : "w-[10.75rem] border-e border-[var(--line)] p-[var(--space-2)] opacity-100 lg:w-[11.75rem] lg:p-[var(--space-2)] xl:w-[14.5rem] xl:p-[var(--space-3)]",
          )}
        >
          {collapsed ? null : (
            <SectionPanel companyName={companyName} section={activeLink} />
          )}
        </aside>
      </div>
    </>
  );
}
