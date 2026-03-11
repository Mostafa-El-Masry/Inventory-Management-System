import { PurchaseTransactionDetailPage } from "../../_components/purchase-transaction-detail-page";

export default async function OpeningStockDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PurchaseTransactionDetailPage
      transactionId={id}
      backHref="/transactions/opening-stock"
      backLabel="Back to Opening Stock History"
      allowedTypes={["ADJUSTMENT"]}
      adjustmentMode="opening"
    />
  );
}
