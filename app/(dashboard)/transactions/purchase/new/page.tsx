import { PurchaseTransactionPage } from "../../_components/purchase-transaction-page";

export default function NewPurchasePage() {
  return (
    <PurchaseTransactionPage
      headerTitle="New Purchase"
      headerSubtitle="Create and post purchase receipts into inventory."
      createTitle="Create Purchase (single-line quick entry)"
      historyTitle="Purchase History"
      transactionType="RECEIPT"
      locationLabel="Destination location"
      locationTarget="destination"
      viewMode="create"
      headerAction={{
        href: "/transactions/purchase",
        label: "Back to purchase history",
        kind: "back",
      }}
      successMessage="Purchase draft created."
    />
  );
}
