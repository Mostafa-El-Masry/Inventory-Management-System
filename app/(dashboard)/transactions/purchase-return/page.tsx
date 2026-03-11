import { PurchaseTransactionPage } from "../_components/purchase-transaction-page";

export default function PurchaseReturnPage() {
  return (
    <PurchaseTransactionPage
      headerTitle="Purchase Return"
      headerSubtitle="Create and post purchase return transactions."
      createTitle="Create Purchase Return (single-line quick entry)"
      historyTitle="Purchase Return History"
      transactionType="RETURN_OUT"
      locationLabel="Source location"
      locationTarget="source"
      detailBasePath="/transactions/purchase-return"
      summaryHistory
    />
  );
}
