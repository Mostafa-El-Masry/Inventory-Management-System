import { supabaseAdmin } from "@/lib/supabase/admin";

export type AuthRateLimitEndpoint = "login" | "reset-password";

type RateLimitConfig = {
  ip: { limit: number; windowSeconds: number };
  email: { limit: number; windowSeconds: number };
};

type RpcRateLimitRow = {
  allowed: boolean;
  retry_after_seconds: number | null;
};

const LIMITS: Record<AuthRateLimitEndpoint, RateLimitConfig> = {
  login: {
    ip: { limit: 30, windowSeconds: 15 * 60 },
    email: { limit: 8, windowSeconds: 15 * 60 },
  },
  "reset-password": {
    ip: { limit: 10, windowSeconds: 15 * 60 },
    email: { limit: 3, windowSeconds: 60 * 60 },
  },
};

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function normalizeEmail(email?: string): string | null {
  if (!email) {
    return null;
  }

  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

async function checkBucket(
  endpoint: AuthRateLimitEndpoint,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const { data, error } = await supabaseAdmin.rpc("rpc_check_rate_limit", {
    p_endpoint: endpoint,
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.warn(
      `[AUTH] Rate limiter RPC failed for ${endpoint}/${bucket}: ${error.message}`,
    );
    // Fail open to keep authentication available if the limiter backend is temporarily down.
    return { allowed: true };
  }

  const row = (Array.isArray(data) ? data[0] : data) as RpcRateLimitRow | undefined;
  if (!row || typeof row.allowed !== "boolean") {
    console.warn(
      `[AUTH] Rate limiter RPC returned invalid shape for ${endpoint}/${bucket}.`,
    );
    return { allowed: true };
  }

  if (row.allowed) {
    return { allowed: true };
  }

  return {
    allowed: false,
    retryAfter: Math.max(0, Number(row.retry_after_seconds ?? 0) || 0),
  };
}

export async function checkRateLimit(
  request: Request,
  endpoint: AuthRateLimitEndpoint,
  email?: string,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const config = LIMITS[endpoint];
  const results: Array<{ allowed: boolean; retryAfter?: number }> = [];

  const ipBucket = `ip:${getClientIp(request)}`;
  results.push(
    await checkBucket(endpoint, ipBucket, config.ip.limit, config.ip.windowSeconds),
  );

  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    const emailBucket = `email:${normalizedEmail}`;
    results.push(
      await checkBucket(
        endpoint,
        emailBucket,
        config.email.limit,
        config.email.windowSeconds,
      ),
    );
  }

  const deniedResults = results.filter((result) => !result.allowed);
  if (deniedResults.length === 0) {
    return { allowed: true };
  }

  const retryAfter = Math.max(
    ...deniedResults.map((result) => result.retryAfter ?? 0),
    0,
  );

  return {
    allowed: false,
    retryAfter: retryAfter > 0 ? retryAfter : undefined,
  };
}
