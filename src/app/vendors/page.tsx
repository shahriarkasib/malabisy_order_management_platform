import type { Metadata } from "next";

export const metadata: Metadata = { title: "Vendors" };

export default function VendorsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Vendors</h1>
      <p className="text-muted-foreground">Vendor accounts, courier rules, pickup locations.</p>
      <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
        Vendor management coming soon.
      </div>
    </div>
  );
}
