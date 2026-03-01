import { supabaseAdmin } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { passwordResetRequestSchema } from "@/lib/validation";
import { ok, parseBody } from "@/lib/utils/http";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { NextResponse } from "next/server";
import { resolveTrustedOrigin } from "@/lib/auth/trusted-origin";
import { serverEnv } from "@/lib/server-env";

function buildRedirectTo(request: Request) {
  const { origin } = resolveTrustedOrigin(request);
  return `${origin}/auth/callback?next=/auth/set-password`;
}

function isRecoveryEmailDeliveryFailure(message: string) {
  return message.toLowerCase().includes("error sending recovery email");
}

/**
 * POST /api/auth/reset-password
 *
 * Initiates password reset flow. Always returns success to prevent user enumeration.
 *
 * SECURITY NOTES:
 * - Rate limited to prevent brute force and spam attacks
 * - Returns same success response for valid/invalid emails (prevents user enumeration)
 * - Dev recovery links should NOT be exposed in production
 * - In development, use Supabase auth URLs or backend testing tools instead
 */
export async function POST(request: Request) {
  const payload = await parseBody(request, passwordResetRequestSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const email = payload.data.email.trim().toLowerCase();
  const rateLimit = await checkRateLimit(request, "reset-password", email);
  if (rateLimit.temporaryFailure) {
    const retryAfter = rateLimit.retryAfter || 60;
    return NextResponse.json(
      {
        error: "Password reset is temporarily unavailable. Please try again shortly.",
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
        error: "Too many password reset attempts. Please try again later.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": retryAfter.toString(),
        },
      },
    );
  }

  const redirectTo = buildRedirectTo(request);

  const supabase = await createServerSupabaseClient();
  const resetResult = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  // IMPORTANT: Always return success regardless of email validity to prevent user enumeration.
  // This is the correct behavior - attackers should not be able to discover valid email addresses.
  if (!resetResult.error) {
    return ok({ success: true });
  }

  const canUseDevFallback =
    process.env.NODE_ENV === "development" &&
    serverEnv.AUTH_DEV_RESET_FALLBACK_ENABLED;
  if (!canUseDevFallback || !isRecoveryEmailDeliveryFailure(resetResult.error.message)) {
    // Still return success to prevent enumeration
    console.warn(`[AUTH] Password reset failed for ${email}: ${resetResult.error.message}`);
    return ok({ success: true });
  }

  // Development-only fallback: Generate recovery link for email testing
  // NOTE: This is for LOCAL DEVELOPMENT ONLY and should NOT be exposed in production
  const generated = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  if (generated.error) {
    console.warn(`[AUTH] Could not generate recovery link for ${email}: ${generated.error.message}`);
    return ok({ success: true });
  }

  // In development, log the link to console instead of returning it in response
  // This prevents accidental exposure via browser history, API logs, etc.
  const actionLink = generated.data.properties?.action_link;
  if (actionLink) {
    console.log(
      `[AUTH] Development password reset link for ${email}:\n${actionLink}\n\nExpires in 1 hour.`,
    );
  }

  return ok({
    success: true,
    warning:
      "Development mode: Password reset link has been logged to server console. Copy from there.",
  });
}
