import { assertMasterPermission, getAuthContext } from "@/lib/auth/permissions";
import {
  MASTER_ENTITIES,
  MASTER_IMPORT_TEMPLATE_HEADERS,
  type MasterEntity,
} from "@/lib/master-sync/contracts";
import { fail } from "@/lib/utils/http";

function parseEntity(raw: string | null): MasterEntity | null {
  if (!raw) {
    return null;
  }

  return MASTER_ENTITIES.includes(raw as MasterEntity) ? (raw as MasterEntity) : null;
}

export async function GET(request: Request) {
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

  const csv = `${MASTER_IMPORT_TEMPLATE_HEADERS[entity].join(",")}\n`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${entity}-import-template.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
