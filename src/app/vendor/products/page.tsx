import type { Metadata } from "next";
import { requireVendor } from "@/lib/auth/server";
import { fetchVendorProducts } from "@/lib/bigquery/vendor-queries";
import { VendorProductsTable } from "@/components/vendor/products-table";

export const metadata: Metadata = { title: "Products · Vendor Portal" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ search?: string }>;
}

export default async function VendorProductsPage({ searchParams }: Props) {
  const session = await requireVendor();
  const sp = await searchParams;
  const search = sp.search ?? "";

  const rows = await fetchVendorProducts(session.vendors, { search, limit: 500 });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Products</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? "variant" : "variants"} • Click any value to edit. Edits sync to Shopify automatically.
        </p>
      </div>
      <VendorProductsTable rows={rows} />
    </div>
  );
}
