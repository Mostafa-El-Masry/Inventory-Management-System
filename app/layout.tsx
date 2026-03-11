import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Manrope } from "next/font/google";
import { cookies } from "next/headers";

import {
  DEFAULT_THEME_MODE,
  THEME_COOKIE_NAME,
  THEME_STORAGE_KEY,
  ThemeMode,
  normalizeThemeMode,
} from "@/lib/theme";
import "./globals.css";

const heading = Manrope({
  variable: "--font-heading",
  weight: ["500", "600", "700", "800"],
  subsets: ["latin"],
});

const body = Inter({
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-code",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ICE",
  description: "Multi-location inventory with expiry, transactions, and transfer workflows.",
};

function buildThemeBootScript(initialTheme: ThemeMode) {
  return `
(() => {
  const cookieName = ${JSON.stringify(THEME_COOKIE_NAME)};
  const storageKey = ${JSON.stringify(THEME_STORAGE_KEY)};
  const defaultTheme = ${JSON.stringify(initialTheme)};
  const buildCookie = (theme) => {
    const segments = [
      \`\${cookieName}=\${theme}\`,
      "Path=/",
      "Max-Age=31536000",
      "SameSite=Lax",
    ];

    if (window.location.protocol === "https:") {
      segments.push("Secure");
    }

    return segments.join("; ");
  };

  try {
    const stored = window.localStorage.getItem(storageKey);
    const hasStoredTheme = stored === "light" || stored === "dark";
    const theme = hasStoredTheme ? stored : defaultTheme;
    document.documentElement.dataset.theme = theme;

    if (!hasStoredTheme) {
      window.localStorage.setItem(storageKey, theme);
    }

    document.cookie = buildCookie(theme);
  } catch {
    document.documentElement.dataset.theme = defaultTheme;

    try {
      document.cookie = buildCookie(defaultTheme);
    } catch {}
  }
})();
`;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialTheme = normalizeThemeMode(
    cookieStore.get(THEME_COOKIE_NAME)?.value ?? DEFAULT_THEME_MODE,
  );
  const themeBootScript = buildThemeBootScript(initialTheme);

  return (
    <html lang="en" data-theme={initialTheme} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className={`${heading.variable} ${body.variable} ${mono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
