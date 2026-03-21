import { AdjustmentTransactionPage } from "../_components/adjustment-transaction-page";

export default function OpeningStockPage() {
  return (
    <AdjustmentTransactionPage
      mode="opening"
      headerTitle="Opening Stock"
      headerSubtitle="Save opening balances to update stock immediately, then post to finalize them."
      createTitle="Save Opening Stock (single-line quick entry)"
      historyTitle="Opening Stock History"
      detailBasePath="/transactions/opening-stock"
      summaryHistory
    />
  );
}
