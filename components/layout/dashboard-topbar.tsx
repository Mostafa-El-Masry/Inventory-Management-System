"use client";

import Link from "next/link";
import { type ReactNode, type SVGProps, useEffect, useRef, useState } from "react";

import { THEME_STORAGE_KEY, ThemeMode, normalizeThemeMode } from "@/lib/theme";
import { Role } from "@/lib/types/domain";

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

function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgIcon {...props}>
      <path d="m6 9 6 6 6-6" />
    </SvgIcon>
  );
}

function SunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2" />
      <path d="M12 19.3v2.2" />
      <path d="m4.93 4.93 1.56 1.56" />
      <path d="m17.51 17.51 1.56 1.56" />
      <path d="M2.5 12h2.2" />
      <path d="M19.3 12h2.2" />
      <path d="m4.93 19.07 1.56-1.56" />
      <path d="m17.51 6.49 1.56-1.56" />
    </SvgIcon>
  );
}

function MoonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgIcon {...props}>
      <path d="M20.1 14.1A7.9 7.9 0 0 1 9.9 3.9a8.7 8.7 0 1 0 10.2 10.2Z" />
    </SvgIcon>
  );
}

export function DashboardTopbar({
  companyName,
  displayName,
  role,
}: {
  companyName: string;
  displayName: string;
  role: Role;
}) {
  const [open, setOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    typeof document === "undefined"
      ? "light"
      : normalizeThemeMode(document.documentElement.dataset.theme),
  );
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  const displayInitial = displayName.trim().charAt(0).toUpperCase() || "U";
  const isDarkMode = themeMode === "dark";
  const nextTheme: ThemeMode = isDarkMode ? "light" : "dark";

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function setTheme(nextTheme: ThemeMode) {
    document.documentElement.dataset.theme = nextTheme;
    setThemeMode(nextTheme);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Ignore localStorage write errors in privacy-restricted environments.
    }
  }

  function toggleTheme() {
    setTheme(nextTheme);
  }

  return (
    <div className="ims-dashboard-topbar fixed inset-x-0 top-0 hidden md:block">
      <div className="border-b border-[var(--line)] bg-[color:color-mix(in_srgb,var(--surface)_96%,var(--canvas)_4%)] shadow-[var(--shadow-sm)]">
        <div className="flex min-h-[var(--dashboard-topbar-h)] w-full items-center justify-between gap-3 px-[var(--space-4)] py-[var(--space-2)] lg:px-[var(--space-5)] xl:px-[var(--space-7)]">
          <div className="min-w-0">
            <p className="truncate text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)] lg:text-[0.72rem]">
              {companyName}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="ims-theme-toggle"
              data-mode={nextTheme}
              aria-label={`Switch to ${nextTheme} mode`}
              aria-pressed={isDarkMode}
              onClick={toggleTheme}
            >
              <span className="ims-theme-toggle-copy" aria-hidden="true">
                <span className="ims-theme-toggle-copy-text">
                  <span>{nextTheme === "dark" ? "Dark" : "Light"}</span>
                  <span>Mode</span>
                </span>
              </span>
              <span className="ims-theme-toggle-thumb" aria-hidden="true">
                {nextTheme === "dark" ? (
                  <MoonIcon className="h-[1.2rem] w-[1.2rem]" />
                ) : (
                  <SunIcon className="h-[1.2rem] w-[1.2rem]" />
                )}
              </span>
            </button>
            <div className="relative">
              <button
                ref={triggerRef}
                type="button"
                className="flex items-center gap-1.5 rounded-full border-0 bg-transparent pl-2 pr-1 text-left transition hover:bg-[var(--surface-soft)] lg:gap-2 lg:pl-3"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="Open account menu"
                onClick={() => setOpen((current) => !current)}
              >
                <div className="flex ims-icon-btn-md items-center justify-center rounded-full bg-[var(--surface-soft)] text-[0.75rem] font-bold text-[var(--text-strong)] lg:h-[var(--icon-btn-lg)] lg:w-[var(--icon-btn-lg)] lg:text-[0.82rem]">
                  {displayInitial}
                </div>
                <div className="hidden min-w-0 lg:block">
                  <p className="truncate text-[0.82rem] font-semibold text-[var(--text-strong)] xl:text-[0.9rem]">
                    {displayName}
                  </p>
                  <p className="truncate text-[0.68rem] text-[var(--text-muted)] xl:text-[0.74rem]">{roleLabel}</p>
                </div>
                <ChevronDownIcon className="hidden h-4 w-4 text-[var(--text-muted)] lg:block" />
              </button>

              {open ? (
                <div
                  ref={menuRef}
                  role="menu"
                  className="absolute right-0 top-[calc(100%+0.5rem)] min-w-[11rem] rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-1 shadow-[var(--shadow-md)]"
                >
                  <Link
                    href="/admin/settings"
                    role="menuitem"
                    className="block rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--text-strong)] transition hover:bg-[var(--surface-muted)]"
                    onClick={() => setOpen(false)}
                  >
                    Settings
                  </Link>
                  <form action="/api/auth/logout" method="post">
                    <button
                      type="submit"
                      role="menuitem"
                      className="block w-full rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm text-[var(--text-strong)] transition hover:bg-[var(--surface-muted)]"
                      onClick={() => setOpen(false)}
                    >
                      Logout
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
