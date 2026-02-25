import { getAuthContext } from "@/lib/auth/permissions";
import { TransferStatus } from "@/lib/types/domain";
import { fail, ok } from "@/lib/utils/http";

const transferStatuses: TransferStatus[] = [
  "REQUESTED",
  "APPROVED",
  "DISPATCHED",
  "RECEIVED",
  "REJECTED",
  "CANCELLED",
];

export async function GET() {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const isAdmin = context.profile.role === "admin";

  const productsQuery = context.supabase
    .from("products")
    .select("id", { count: "exact", head: true });

  const lowStockQuery = context.supabase
    .from("v_low_stock")
    .select("product_id", { count: "exact", head: true });

  let expiringQuery = context.supabase
    .from("v_expiring_batches")
    .select("batch_id", { count: "exact", head: true });

  let recentTransactionsQuery = context.supabase
    .from("inventory_transactions")
    .select("id, tx_number, type, status, created_at, source_location_id, destination_location_id")
    .order("created_at", { ascending: false })
    .limit(20);

  let transfersQuery = context.supabase
    .from("transfers")
    .select("status, from_location_id, to_location_id");

  if (!isAdmin && context.locationIds.length > 0) {
    const locFilter = context.locationIds.join(",");
    expiringQuery = expiringQuery.in("location_id", context.locationIds);
    recentTransactionsQuery = recentTransactionsQuery.or(
      `source_location_id.in.(${locFilter}),destination_location_id.in.(${locFilter})`,
    );
    transfersQuery = transfersQuery.or(
      `from_location_id.in.(${locFilter}),to_location_id.in.(${locFilter})`,
    );
  } else if (!isAdmin && context.locationIds.length === 0) {
    return ok({
      totalSkus: 0,
      lowStockCount: 0,
      expiringSoonCount: 0,
      transferSummary: Object.fromEntries(transferStatuses.map((status) => [status, 0])),
      recentTransactions: [],
    });
  }

  const [productsResult, lowStockResult, expiringResult, transfersResult, recentResult] =
    await Promise.all([
      productsQuery,
      lowStockQuery,
      expiringQuery,
      transfersQuery,
      recentTransactionsQuery,
    ]);

  const errors = [
    productsResult.error,
    lowStockResult.error,
    expiringResult.error,
    transfersResult.error,
    recentResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    return fail(errors[0]?.message ?? "Failed to build dashboard metrics.", 400);
  }

  const transferSummary = Object.fromEntries(
    transferStatuses.map((status) => [status, 0]),
  ) as Record<TransferStatus, number>;

  for (const transfer of transfersResult.data ?? []) {
    transferSummary[transfer.status as TransferStatus] += 1;
  }

  return ok({
    totalSkus: productsResult.count ?? 0,
    lowStockCount: lowStockResult.count ?? 0,
    expiringSoonCount: expiringResult.count ?? 0,
    transferSummary,
    recentTransactions: recentResult.data ?? [],
  });
}
