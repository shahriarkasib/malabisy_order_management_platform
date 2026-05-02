import type { Metadata } from "next";
import Link from "next/link";
import { requireVendor } from "@/lib/auth/server";
import { fetchVendorProducts } from "@/lib/bigquery/vendor-queries";
import { VendorProductsTable } from "@/components/vendor/products-table";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Products · Vendor Portal" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ search?: string; v?: string }>;
}

export default async function VendorProductsPage({ searchParams }: Props) {
  const session = await requireVendor();
  const sp = await searchParams;
  const search = sp.search ?? "";

  // If the user has access to multiple vendors, default to the first one and
  // expose tabs to switch. If only one, the tab strip stays hidden.
  const requested = sp.v;
  const activeVendor =
    requested && session.vendors.includes(requested) ? requested : session.vendors[0];

  const rows = await fetchVendorProducts([activeVendor], { search, limit: 500 });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Products</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? "variant" : "variants"} • Click any value to edit. Edits sync to Shopify automatically.
        </p>
      </div>

      {session.vendors.length > 1 && (
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
          {session.vendors.map((v) => (
            <Link
              key={v}
              href={`/vendor/products?v=${encodeURIComponent(v)}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                v === activeVendor
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {v}
            </Link>
          ))}
        </div>
      )}

      <VendorProductsTable rows={rows} />
    </div>
  );
}
