import { supabaseAdmin } from "@/lib/supabase/admin";

export type AuthRateLimitEndpoint = "login" | "reset-password";
const RATE_LIMIT_BACKEND_RETRY_AFTER_SECONDS = 60;

type RateLimitConfig = {
  ip: { limit: number; windowSeconds: number };
  email: { limit: number; windowSeconds: number };
};

type RpcRateLimitRow = {
  allowed: boolean;
  retry_after_seconds: number | null;
};

export type RateLimitDecision = {
  allowed: boolean;
  retryAfter?: number;
  temporaryFailure?: boolean;
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
  const cfConnectingIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "unknown";
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
): Promise<RateLimitDecision> {
  let data: unknown;
  let error: { message: string } | null = null;

  try {
    const result = await supabaseAdmin.rpc("rpc_check_rate_limit", {
      p_endpoint: endpoint,
      p_bucket: bucket,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    data = result.data;
    error = result.error;
  } catch (unknownError) {
    const message =
      unknownError instanceof Error ? unknownError.message : "unknown rpc error";
    console.warn(
      `[AUTH] Rate limiter RPC threw for ${endpoint}/${bucket}: ${message}`,
    );
    return {
      allowed: false,
      temporaryFailure: true,
      retryAfter: RATE_LIMIT_BACKEND_RETRY_AFTER_SECONDS,
    };
  }

  if (error) {
    console.warn(
      `[AUTH] Rate limiter RPC failed for ${endpoint}/${bucket}: ${error.message}`,
    );
    return {
      allowed: false,
      temporaryFailure: true,
      retryAfter: RATE_LIMIT_BACKEND_RETRY_AFTER_SECONDS,
    };
  }

  const row = (Array.isArray(data) ? data[0] : data) as RpcRateLimitRow | undefined;
  if (!row || typeof row.allowed !== "boolean") {
    console.warn(
      `[AUTH] Rate limiter RPC returned invalid shape for ${endpoint}/${bucket}.`,
    );
    return {
      allowed: false,
      temporaryFailure: true,
      retryAfter: RATE_LIMIT_BACKEND_RETRY_AFTER_SECONDS,
    };
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
): Promise<RateLimitDecision> {
  const config = LIMITS[endpoint];
  const results: RateLimitDecision[] = [];

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

  const unavailableResults = results.filter((result) => result.temporaryFailure);
  if (unavailableResults.length > 0) {
    return {
      allowed: false,
      temporaryFailure: true,
      retryAfter: Math.max(
        ...unavailableResults.map((result) => result.retryAfter ?? 0),
        RATE_LIMIT_BACKEND_RETRY_AFTER_SECONDS,
      ),
    };
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
