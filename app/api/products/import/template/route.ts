import { assertMasterPermission, getAuthContext } from "@/lib/auth/permissions";
import { buildProductImportTemplateCsv } from "@/lib/products/import";

export async function GET() {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const permissionError = assertMasterPermission(context, "products", "import");
  if (permissionError) {
    return permissionError;
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
