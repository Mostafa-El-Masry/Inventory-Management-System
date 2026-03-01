const CALLBACK_NEXT_FALLBACK = "/dashboard";

export function sanitizeNextPath(
  nextPath: string | null,
  fallbackPath = CALLBACK_NEXT_FALLBACK,
): string {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return fallbackPath;
  }

  try {
    const parsed = new URL(nextPath, "https://ims.local");
    if (parsed.origin !== "https://ims.local") {
      return fallbackPath;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallbackPath;
  }
}
