import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { sanitizeNextPath } from "@/lib/auth/callback-redirect";
import { resolveTrustedOrigin } from "@/lib/auth/trusted-origin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function toTrustedUrl(request: Request, path: string) {
  const { origin } = resolveTrustedOrigin(request);
  return new URL(path, origin);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = sanitizeNextPath(requestUrl.searchParams.get("next"));

  if (!code && !(tokenHash && type)) {
    return NextResponse.redirect(toTrustedUrl(request, "/login?error=missing_code"));
  }

  const supabase = await createServerSupabaseClient();
  let errorMessage: string | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    errorMessage = error?.message ?? null;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    errorMessage = error?.message ?? null;
  }

  if (errorMessage) {
    console.warn(
      `[AUTH] Callback verification failed (${type ?? "code"}): ${errorMessage}`,
    );
    return NextResponse.redirect(
      toTrustedUrl(request, "/login?error=auth_callback_failed"),
    );
  }

  if (type === "recovery" || type === "invite") {
    return NextResponse.redirect(toTrustedUrl(request, "/auth/set-password"));
  }

  return NextResponse.redirect(toTrustedUrl(request, next));
}
