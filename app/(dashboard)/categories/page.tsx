import { redirect } from "next/navigation";

export default function CategoriesLegacyRedirectPage() {
  redirect("/master/categories");
}
