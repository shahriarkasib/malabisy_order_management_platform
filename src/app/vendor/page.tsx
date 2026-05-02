import { redirect } from "next/navigation";

// Vendors only have one page right now — the products editor. Send them straight there.
export default function VendorIndex() {
  redirect("/vendor/products");
}
