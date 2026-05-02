import type { Metadata } from "next";
import Link from "next/link";
import { requireVendor } from "@/lib/auth/server";
import { fetchVendorSummary } from "@/lib/bigquery/vendor-queries";
import { Package, ShoppingCart, ChartColumn } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard · Vendor Portal" };
export const dynamic = "force-dynamic";

export default async function VendorDashboard() {
  const session = await requireVendor();
  const summary = await fetchVendorSummary(session.vendors);

  const cards = [
    {
      label: "Active products",
      value: `${summary.active_products?.toLocaleString() ?? 0}`,
      hint: `${summary.total_products?.toLocaleString() ?? 0} total`,
      href: "/vendor/products",
      icon: Package,
    },
    {
      label: "Orders (last 30 days)",
      value: `${summary.total_orders_30d?.toLocaleString() ?? 0}`,
      hint: "unique orders",
      href: "/vendor/orders",
      icon: ShoppingCart,
    },
    {
      label: "Revenue (last 30 days)",
      value: formatCurrency(Number(summary.revenue_30d) || 0, "EGP"),
      hint: "net of line discounts",
      href: "/vendor/analytics",
      icon: ChartColumn,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome, {session.display_name?.split(" ")[0] || "vendor"}</h1>
        <p className="text-sm text-muted-foreground">
          You manage <span className="font-medium">{session.vendors.join(", ")}</span>.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="group rounded-xl border border-border bg-card p-6 shadow-sm transition-all hover:border-primary/50 hover:shadow"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
              <card.icon className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
            <p className="mt-3 text-3xl font-bold tracking-tight">{card.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Quick actions</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li>
            <Link href="/vendor/products" className="text-primary hover:underline">
              Edit your product cost & inventory →
            </Link>
          </li>
          <li>
            <Link href="/vendor/orders" className="text-primary hover:underline">
              See your recent orders →
            </Link>
          </li>
          <li>
            <Link href="/vendor/analytics" className="text-primary hover:underline">
              Performance trends →
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
