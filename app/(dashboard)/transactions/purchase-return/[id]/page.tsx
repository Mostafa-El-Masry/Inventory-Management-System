import { PurchaseTransactionDetailPage } from "../../_components/purchase-transaction-detail-page";

export default async function PurchaseReturnDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PurchaseTransactionDetailPage
      transactionId={id}
      backHref="/transactions/purchase-return"
      backLabel="Back to Purchase Return History"
      allowedTypes={["RETURN_OUT"]}
    />
  );
}
