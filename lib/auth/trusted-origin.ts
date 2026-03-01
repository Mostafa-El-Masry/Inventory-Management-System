import { serverEnv } from "@/lib/server-env";

export function getAllowedOrigins(): string[] {
  return serverEnv.APP_ORIGIN_ALLOWLIST;
}

export function resolveTrustedOrigin(request: Request): {
  origin: string;
  trusted: boolean;
} {
  const allowedOrigins = getAllowedOrigins();
  const fallbackOrigin = allowedOrigins[0];

  let requestOrigin: string | null = null;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    requestOrigin = null;
  }

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return { origin: requestOrigin, trusted: true };
  }

  if (requestOrigin) {
    console.warn(
      `[AUTH] Untrusted origin '${requestOrigin}' received. Falling back to '${fallbackOrigin}'.`,
    );
  } else {
    console.warn(
      `[AUTH] Could not parse request URL '${request.url}'. Falling back to '${fallbackOrigin}'.`,
    );
  }

  return { origin: fallbackOrigin, trusted: false };
}
