import { AdjustmentTransactionPage } from "../_components/adjustment-transaction-page";

export default function StockAdjustmentPage() {
  return (
    <AdjustmentTransactionPage
      mode="adjustment"
      headerTitle="Stock Adjustment"
      headerSubtitle="Save stock adjustments to update stock and cost immediately, then post to finalize them."
      createTitle="Save Stock Adjustment (single-line quick entry)"
      historyTitle="Stock Adjustment History"
      detailBasePath="/transactions/stock-adjustment"
      summaryHistory
    />
  );
}
