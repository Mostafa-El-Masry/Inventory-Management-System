import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation";
import { parseBody } from "@/lib/utils/http";
import { checkRateLimit } from "@/lib/auth/rate-limit";

/**
 * POST /api/auth/login
 *
 * Authenticates a user with email and password.
 *
 * SECURITY NOTES:
 * - Rate limited with durable storage to prevent brute force attacks across instances
 * - Uses both IP and email buckets for better abuse resistance
 * - Logs failed login attempts for security monitoring
 */
export async function POST(request: Request) {
  const payload = await parseBody(request, loginSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const email = payload.data.email.trim().toLowerCase();

  const rateLimit = await checkRateLimit(request, "login", email);
  if (rateLimit.temporaryFailure) {
    const retryAfter = rateLimit.retryAfter || 60;
    return NextResponse.json(
      {
        error: "Authentication service is temporarily unavailable. Please try again shortly.",
      },
      {
        status: 503,
        headers: {
          "Retry-After": retryAfter.toString(),
        },
      },
    );
  }

  if (!rateLimit.allowed) {
    const retryAfter = rateLimit.retryAfter || 900;
    return NextResponse.json(
      {
        error: "Too many login attempts. Please try again later.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": retryAfter.toString(),
        },
      },
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: payload.data.password,
  });

  if (error || !data.session) {
    // Log failed attempt without exposing details to client
    console.warn(`[AUTH] Failed login attempt for ${email}`);
    return NextResponse.json(
      {
        error: "Invalid login credentials.",
      },
      { status: 401 },
    );
  }

  return NextResponse.json({ success: true });
}
