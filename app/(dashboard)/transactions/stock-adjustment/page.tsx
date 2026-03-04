import { AdjustmentTransactionPage } from "../_components/adjustment-transaction-page";

export default function StockAdjustmentPage() {
  return (
    <AdjustmentTransactionPage
      mode="adjustment"
      headerTitle="Stock Adjustment"
      headerSubtitle="Add or remove stock with controlled adjustment entries."
      createTitle="Create Stock Adjustment (single-line quick entry)"
      historyTitle="Stock Adjustment History"
    />
  );
}
