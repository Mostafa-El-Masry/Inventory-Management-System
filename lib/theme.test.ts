import { describe, expect, it } from "vitest";

import {
  DEFAULT_THEME_MODE,
  THEME_COOKIE_NAME,
  buildThemeCookieString,
  normalizeThemeMode,
} from "@/lib/theme";

describe("theme helpers", () => {
  it("normalizes invalid values to the default theme", () => {
    expect(normalizeThemeMode(undefined)).toBe(DEFAULT_THEME_MODE);
    expect(normalizeThemeMode("system")).toBe(DEFAULT_THEME_MODE);
    expect(normalizeThemeMode(null)).toBe(DEFAULT_THEME_MODE);
  });

  it("preserves valid theme values", () => {
    expect(normalizeThemeMode("light")).toBe("light");
    expect(normalizeThemeMode("dark")).toBe("dark");
  });

  it("builds the theme cookie string with required attributes", () => {
    expect(buildThemeCookieString("dark")).toBe(
      `${THEME_COOKIE_NAME}=dark; Path=/; Max-Age=31536000; SameSite=Lax`,
    );
    expect(buildThemeCookieString("light", { secure: true })).toBe(
      `${THEME_COOKIE_NAME}=light; Path=/; Max-Age=31536000; SameSite=Lax; Secure`,
    );
  });
});
