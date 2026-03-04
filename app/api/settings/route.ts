import { assertRole, getAuthContext } from "@/lib/auth/permissions";
import { systemSettingsUpdateSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

const COMPANY_NAME_KEY = "company_name";
const DEFAULT_COMPANY_NAME = "ICE";

function normalizeCompanyName(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export async function GET() {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const { data, error } = await context.supabase
    .from("system_settings")
    .select("value_text")
    .eq("key", COMPANY_NAME_KEY)
    .maybeSingle();

  if (error) {
    return fail(error.message, 400);
  }

  const companyName = normalizeCompanyName(data?.value_text) || DEFAULT_COMPANY_NAME;

  return ok({
    company_name: companyName,
  });
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const roleError = assertRole(context, ["admin"]);
  if (roleError) {
    return roleError;
  }

  const payload = await parseBody(request, systemSettingsUpdateSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const companyName = normalizeCompanyName(payload.data.company_name);
  if (companyName.length < 2) {
    return fail("Company name must be at least 2 characters.", 422);
  }

  const { error } = await context.supabase.from("system_settings").upsert(
    {
      key: COMPANY_NAME_KEY,
      value_text: companyName,
    },
    { onConflict: "key" },
  );

  if (error) {
    return fail(error.message, 400);
  }

  return ok({
    company_name: companyName,
  });
}
