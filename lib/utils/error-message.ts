const HTML_ERROR_MARKERS = [
  "<!doctype html",
  "<html",
  "<head",
  "<body",
  "<title",
  "cloudflare ray id",
  "error code 502",
  "bad gateway",
] as const;

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function looksLikeHtmlError(value: string) {
  const normalized = value.toLowerCase();

  return HTML_ERROR_MARKERS.some((marker) => normalized.includes(marker));
}

export function sanitizeErrorMessage(
  message: string | null | undefined,
  fallbackMessage: string,
) {
  const normalized = collapseWhitespace(message ?? "");

  if (!normalized) {
    return fallbackMessage;
  }

  if (looksLikeHtmlError(normalized)) {
    return "The service is temporarily unavailable. Please try again.";
  }

  return normalized;
}
