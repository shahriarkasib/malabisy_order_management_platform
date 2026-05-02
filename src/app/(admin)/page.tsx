import { redirect } from "next/navigation";

// /orders IS the operational home for admins. The old launcher dashboard
// duplicated what the sidebar already provides. Sending admins straight to work.
export default function AdminRoot() {
  redirect("/orders");
}
