import { PurchaseTransactionPage } from "../_components/purchase-transaction-page";

export default function PurchasePage() {
  return (
    <PurchaseTransactionPage
      headerTitle="Purchase"
      headerSubtitle="Save purchase receipts to update stock immediately, then post to finalize them."
      createTitle="Save Purchase (single-line quick entry)"
      historyTitle="Purchase History"
      transactionType="RECEIPT"
      locationLabel="Destination location"
      locationTarget="destination"
      viewMode="history"
      detailBasePath="/transactions/purchase"
      summaryHistory
      headerAction={{
        href: "/transactions/purchase/new",
        label: "Create purchase",
        kind: "create",
      }}
    />
  );
}
