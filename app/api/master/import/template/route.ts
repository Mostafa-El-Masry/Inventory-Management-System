import { assertRole, getAuthContext } from "@/lib/auth/permissions";
import { MASTER_ENTITIES, MASTER_IMPORT_HEADERS, type MasterEntity } from "@/lib/master-sync/contracts";
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

  const roleError = assertRole(context, ["admin"]);
  if (roleError) {
    return roleError;
  }

  const entity = parseEntity(new URL(request.url).searchParams.get("entity"));
  if (!entity) {
    return fail(
      "Invalid entity. Use one of: locations, products, categories, subcategories, suppliers.",
      422,
    );
  }

  const csv = `${MASTER_IMPORT_HEADERS[entity].join(",")}\n`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${entity}-import-template.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
