export const THEME_STORAGE_KEY = "ims:theme-mode";
export const THEME_COOKIE_NAME = "ims-theme-mode";
export const DEFAULT_THEME_MODE = "light";
const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type ThemeMode = "light" | "dark";

export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === "dark" ? "dark" : DEFAULT_THEME_MODE;
}

export function buildThemeCookieString(
  themeMode: ThemeMode,
  options?: {
    secure?: boolean;
  },
) {
  const segments = [
    `${THEME_COOKIE_NAME}=${themeMode}`,
    "Path=/",
    `Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
  ];

  if (options?.secure) {
    segments.push("Secure");
  }

  return segments.join("; ");
}
