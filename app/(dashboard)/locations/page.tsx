import { redirect } from "next/navigation";

export default function LocationsLegacyRedirectPage() {
  redirect("/master/locations");
}
