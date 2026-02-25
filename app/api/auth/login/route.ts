import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation";
import { parseBody } from "@/lib/utils/http";

export async function POST(request: Request) {
  const payload = await parseBody(request, loginSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword(payload.data);

  if (error || !data.session) {
    return NextResponse.json(
      {
        error: error?.message ?? "Invalid login credentials.",
      },
      { status: 401 },
    );
  }

  return NextResponse.json({ success: true });
}
