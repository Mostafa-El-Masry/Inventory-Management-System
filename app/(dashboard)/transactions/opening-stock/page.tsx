import { AdjustmentTransactionPage } from "../_components/adjustment-transaction-page";

export default function OpeningStockPage() {
  return (
    <AdjustmentTransactionPage
      mode="opening"
      headerTitle="Opening Stock"
      headerSubtitle="Add opening balances into inventory."
      createTitle="Create Opening Stock (single-line quick entry)"
      historyTitle="Opening Stock History"
      detailBasePath="/transactions/opening-stock"
      summaryHistory
    />
  );
}
