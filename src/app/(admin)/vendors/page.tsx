import type { Metadata } from "next";
import { fetchVendorsWithUsers } from "@/lib/bigquery/admin-queries";
import { VendorAccessTable } from "@/components/admin/vendor-access-table";

export const metadata: Metadata = { title: "Vendors" };
export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const vendors = await fetchVendorsWithUsers();
  const totalUsers = new Set(vendors.flatMap((v) => v.users.map((u) => u.email))).size;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vendors</h1>
        <p className="text-sm text-muted-foreground">
          {vendors.length} vendors, {totalUsers} users with portal access. Add an email to grant a vendor login.
        </p>
      </div>
      <VendorAccessTable vendors={vendors} />
    </div>
  );
}
