import { redirect } from "next/navigation";

export default function TransactionsLegacyInnerRedirectPage() {
  redirect("/transactions/purchase");
}
