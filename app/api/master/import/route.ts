import { assertMasterPermission, getAuthContext } from "@/lib/auth/permissions";
import { MASTER_ENTITIES, type MasterEntity } from "@/lib/master-sync/contracts";
import { MasterCsvImportError, parseMasterImportCsv } from "@/lib/master-sync/parse";
import { upsertMasterRows } from "@/lib/master-sync/upsert";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { masterImportSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

function parseEntity(raw: string | null): MasterEntity | null {
  if (!raw) {
    return null;
  }

  return MASTER_ENTITIES.includes(raw as MasterEntity) ? (raw as MasterEntity) : null;
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const entity = parseEntity(new URL(request.url).searchParams.get("entity"));
  if (!entity) {
    return fail(
      "Invalid entity. Use one of: locations, products, categories, subcategories, suppliers.",
      422,
    );
  }

  const permissionError = assertMasterPermission(context, entity, "import");
  if (permissionError) {
    return permissionError;
  }
  const writeClient = context.profile.role === "admin" ? context.supabase : supabaseAdmin;

  const payload = await parseBody(request, masterImportSchema);
  if ("error" in payload) {
    return payload.error;
  }

  let parsed;
  try {
    parsed = parseMasterImportCsv(entity, payload.data.csv);
  } catch (error) {
    if (error instanceof MasterCsvImportError) {
      return fail(error.message, error.status, error.details);
    }
    return fail("Failed to parse CSV import payload.", 422);
  }

  try {
    const summary = await upsertMasterRows(writeClient, parsed);
    return ok(summary, summary.inserted_count > 0 ? 201 : 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Master import failed.";
    return fail(message, 400);
  }
}
