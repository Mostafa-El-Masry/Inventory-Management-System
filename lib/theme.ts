export const THEME_STORAGE_KEY = "ims:theme-mode";

export type ThemeMode = "light" | "dark";

export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === "dark" ? "dark" : "light";
}
