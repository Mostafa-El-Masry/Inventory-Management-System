import { PurchaseTransactionPage } from "../_components/purchase-transaction-page";

export default function PurchasePage() {
  return (
    <PurchaseTransactionPage
      headerTitle="Purchase"
      headerSubtitle="Create and post purchase receipts into inventory."
      createTitle="Create Purchase (single-line quick entry)"
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
