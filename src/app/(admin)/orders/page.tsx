import { Suspense } from "react";
import type { Metadata } from "next";
import { fetchOrders, fetchTabCounts, fetchVendors } from "@/lib/bigquery/queries";
import { PIPELINE_TABS, DIRECTIONS, type PipelineTab, type Direction } from "@/lib/constants";
import { resolvePeriod } from "@/lib/period";
import { PipelineTabs } from "@/components/orders/pipeline-tabs";
import { FilterBar } from "@/components/orders/filter-bar";
import { OrdersPageClient } from "@/components/orders/orders-page-client";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    tab?: string;
    search?: string;
    vendor?: string;
    direction?: string;
    payment?: string;
    period?: string;
    from?: string;
    to?: string;
  }>;
}

function isPipelineTab(v: string): v is PipelineTab {
  return (PIPELINE_TABS as readonly string[]).includes(v);
}
function isDirection(v: string): v is Direction {
  return (DIRECTIONS as readonly string[]).includes(v);
}

export default async function OrdersPage({ searchParams }: Props) {
  const sp = await searchParams;
  const tab = sp.tab && isPipelineTab(sp.tab) ? sp.tab : "All Orders";
  const search = sp.search ?? "";
  const vendor = sp.vendor || undefined;
  const direction = sp.direction && isDirection(sp.direction) ? sp.direction : "All";
  const paymentType = sp.payment && sp.payment !== "All" ? sp.payment : undefined;
  const range = resolvePeriod(sp.period, sp.from, sp.to);

  const [orders, counts, vendors] = await Promise.all([
    fetchOrders({
      pipelineTab: tab, search, vendor, direction, paymentType, limit: 200,
      startDate: range?.startDate,
      endDate: range?.endDate,
    }),
    // Tab counts respect the date filter too — otherwise the badge says "248
    // orders in New Orders" but the table only shows the 12 in the date range.
    fetchTabCounts({ vendor, direction, startDate: range?.startDate, endDate: range?.endDate }),
    fetchVendors(),
  ]);

  // TODO: replace hardcoded actor with auth-derived email once Clerk is wired
  const actorEmail = "shahriarsourav2905@gmail.com";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">
          {orders.length} of {counts.reduce((s, c) => s + c.count, 0).toLocaleString()} line items
          {tab !== "All Orders" ? (
            <> in <span className="font-medium">{tab}</span></>
          ) : null}
        </p>
      </div>

      <PipelineTabs counts={counts} />
      <FilterBar vendors={vendors} />

      <Suspense fallback={<p>Loading…</p>}>
        <OrdersPageClient data={orders} actorEmail={actorEmail} />
      </Suspense>
    </div>
  );
}
