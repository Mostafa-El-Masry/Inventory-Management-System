import { PurchaseTransactionDetailPage } from "../../_components/purchase-transaction-detail-page";

export default async function StockAdjustmentDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PurchaseTransactionDetailPage
      transactionId={id}
      backHref="/transactions/stock-adjustment"
      backLabel="Back to Stock Adjustment History"
      allowedTypes={["ADJUSTMENT"]}
      adjustmentMode="adjustment"
    />
  );
}
