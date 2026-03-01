import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { setPasswordSchema } from "@/lib/validation";
import { ok, parseBody } from "@/lib/utils/http";

export async function POST(request: Request) {
  const payload = await parseBody(request, setPasswordSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", user.id)
    .maybeSingle<{ is_active: boolean }>();

  if (profileError) {
    return NextResponse.json({ error: "Unable to validate account status." }, { status: 400 });
  }

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "User account is inactive." }, { status: 403 });
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: payload.data.password,
  });

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  await supabase.auth.signOut();
  return ok({ success: true });
}
