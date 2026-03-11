import { PurchaseInvoicePage } from "../../_components/purchase-invoice-page";

export default function NewPurchasePage() {
  return (
    <PurchaseInvoicePage
      backHref="/transactions/purchase"
      backLabel="Back to Purchase History"
    />
  );
}
