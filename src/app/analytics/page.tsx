import type { Metadata } from "next";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
      <p className="text-muted-foreground">Performance, ad spend, COGS — coming soon.</p>
      <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
        Charts and KPIs coming soon.
      </div>
    </div>
  );
}
