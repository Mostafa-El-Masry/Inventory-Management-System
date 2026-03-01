import { supabaseAdmin } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { passwordResetRequestSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

function buildRedirectTo(request: Request) {
  const origin = new URL(request.url).origin;
  return `${origin}/auth/callback?next=/auth/set-password`;
}

function buildDevRecoveryLink(request: Request, tokenHash: string) {
  const url = new URL("/auth/callback", request.url);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", "recovery");
  url.searchParams.set("next", "/auth/set-password");
  return url.toString();
}

function isRecoveryEmailDeliveryFailure(message: string) {
  return message.toLowerCase().includes("error sending recovery email");
}

export async function POST(request: Request) {
  const payload = await parseBody(request, passwordResetRequestSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const email = payload.data.email.trim().toLowerCase();
  const redirectTo = buildRedirectTo(request);

  const supabase = await createServerSupabaseClient();
  const resetResult = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (!resetResult.error) {
    return ok({ success: true });
  }

  const canUseDevFallback = process.env.NODE_ENV === "development";
  if (!canUseDevFallback || !isRecoveryEmailDeliveryFailure(resetResult.error.message)) {
    return fail(resetResult.error.message, 400);
  }

  const generated = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  if (generated.error) {
    return fail(resetResult.error.message, 400);
  }

  const tokenHash = generated.data.properties?.hashed_token;
  if (!tokenHash) {
    return fail(resetResult.error.message, 400);
  }

  return ok({
    success: true,
    warning:
      "Email delivery is unavailable. Use the direct recovery link below and add localhost to Supabase Auth redirect URLs.",
    dev_reset_link: buildDevRecoveryLink(request, tokenHash),
  });
}
