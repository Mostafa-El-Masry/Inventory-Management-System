import { assertRole, getAuthContext } from "@/lib/auth/permissions";
import type { SettingsClearTransactionsResponse } from "@/lib/types/api";
import { settingsClearTransactionsSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

function explainClearTransactionsError(message: string) {
  if (
    message.includes("cannot truncate a table referenced in a foreign key constraint") ||
    message.includes("DELETE requires a WHERE clause")
  ) {
    return "Clear transaction data is blocked by an outdated database function. Apply Supabase migration 026 and retry.";
  }

  if (
    message.includes(
      "Transfer lines can only be modified while transfer is REQUESTED.",
    )
  ) {
    return "Clear transaction data is blocked by an outdated transfer-line guard. Apply Supabase migration 027 and retry.";
  }

  return message;
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

  const payload = await parseBody(request, settingsClearTransactionsSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const { data, error } = await context.supabase.rpc("rpc_clear_transaction_data");

  if (error) {
    return fail(explainClearTransactionsError(error.message), 400);
  }

  if (!data || typeof data !== "object") {
    return fail("Failed to clear transaction data.", 400);
  }

  return ok(data as SettingsClearTransactionsResponse);
}
