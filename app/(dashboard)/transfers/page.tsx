import { redirect } from "next/navigation";

export default function TransfersLegacyRedirectPage() {
  redirect("/transactions/transfers");
}
