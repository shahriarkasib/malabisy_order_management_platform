import type { Metadata } from "next";
import { fetchAuditLog } from "@/lib/bigquery/queries";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit Log" };
export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const entries = await fetchAuditLog({ limit: 200, days: 7 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Last 7 days · {entries.length} events
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="border-b border-border">
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">When</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Actor</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Action</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Order</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Tracking</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Mode</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Error</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">
                  No audit entries in the selected window.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.event_id} className="border-b border-border hover:bg-accent/30">
                  <td className="whitespace-nowrap px-3 py-2.5">{formatDateTime(e.clicked_at)}</td>
                  <td className="px-3 py-2.5">{e.actor_email ?? "—"}</td>
                  <td className="px-3 py-2.5"><Badge variant="info">{e.action}</Badge></td>
                  <td className="px-3 py-2.5">{e.shopify_order_name ?? "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{e.tracking_number ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    {e.final_status === "success" ? (
                      <Badge variant="success">success</Badge>
                    ) : e.final_status === "partial" ? (
                      <Badge variant="warning">partial</Badge>
                    ) : (
                      <Badge variant="destructive">{e.final_status ?? "?"}</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {e.dry_run ? <Badge variant="outline">dry-run</Badge> : <Badge variant="default">live</Badge>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-destructive">{e.error_message ?? ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
