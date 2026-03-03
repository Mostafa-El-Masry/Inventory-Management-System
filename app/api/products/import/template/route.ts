import { assertRole, getAuthContext } from "@/lib/auth/permissions";
import { buildProductImportTemplateCsv } from "@/lib/products/import";

export async function GET() {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const roleError = assertRole(context, ["admin"]);
  if (roleError) {
    return roleError;
  }

  const csv = buildProductImportTemplateCsv();

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="products-import-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
