import { PurchaseInvoicePage } from "../../_components/purchase-invoice-page";

export default async function PurchaseTransactionDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PurchaseInvoicePage transactionId={id} backHref="/transactions/purchase" backLabel="Back to Purchase History" />
  );
}
