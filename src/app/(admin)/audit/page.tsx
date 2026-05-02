import type { Metadata } from "next";
import Link from "next/link";
import { fetchAuditLog, fetchVendorEdits } from "@/lib/bigquery/queries";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit Log" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ tab?: string; vendor?: string }>;
}

export default async function AuditPage({ searchParams }: Props) {
  const sp = await searchParams;
  const tab = sp.tab === "vendor-edits" ? "vendor-edits" : "ops";
  const vendorFilter = sp.vendor || undefined;

  const [opsEntries, vendorEdits] = await Promise.all([
    fetchAuditLog({ limit: 200, days: 30 }),
    fetchVendorEdits({ limit: 500, days: 30, vendor: vendorFilter }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Last 30 days · all role-based activity.
          {vendorFilter && (
            <> · Filtered to <span className="font-medium">{vendorFilter}</span> · <Link href="/audit?tab=vendor-edits" className="text-primary underline">clear filter</Link></>
          )}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-card p-1 w-fit">
        <Link
          href="/audit"
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "ops"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          Ops actions <span className="ml-1 text-xs opacity-70">({opsEntries.length})</span>
        </Link>
        <Link
          href="/audit?tab=vendor-edits"
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "vendor-edits"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          Vendor edits <span className="ml-1 text-xs opacity-70">({vendorEdits.length})</span>
        </Link>
      </div>

      {tab === "ops" ? <OpsTable entries={opsEntries} /> : <VendorEditsTable entries={vendorEdits} />}
    </div>
  );
}

function OpsTable({ entries }: { entries: Awaited<ReturnType<typeof fetchAuditLog>> }) {
  return (
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
            <tr><td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">No ops actions in the last 7 days.</td></tr>
          ) : (
            entries.map((e) => (
              <tr key={e.event_id} className="border-b border-border hover:bg-accent/30">
                <td className="whitespace-nowrap px-3 py-2.5">{formatDateTime(e.clicked_at)}</td>
                <td className="px-3 py-2.5">{e.actor_email ?? "—"}</td>
                <td className="px-3 py-2.5"><Badge variant="info">{e.action}</Badge></td>
                <td className="px-3 py-2.5">{e.shopify_order_name ?? "—"}</td>
                <td className="px-3 py-2.5 font-mono text-xs">{e.tracking_number ?? "—"}</td>
                <td className="px-3 py-2.5">
                  {e.final_status === "success" ? <Badge variant="success">success</Badge>
                    : e.final_status === "partial" ? <Badge variant="warning">partial</Badge>
                    : <Badge variant="destructive">{e.final_status ?? "?"}</Badge>}
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
  );
}

function VendorEditsTable({ entries }: { entries: Awaited<ReturnType<typeof fetchVendorEdits>> }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr className="border-b border-border">
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">When</th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Vendor</th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Actor</th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Field</th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Variant</th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Old → New</th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Error</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr><td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">No vendor edits yet — once vendors edit cost / price / inventory, they'll show up here.</td></tr>
          ) : (
            entries.map((e) => (
              <tr key={e.edit_id} className="border-b border-border hover:bg-accent/30">
                <td className="whitespace-nowrap px-3 py-2.5">{formatDateTime(e.edited_at)}</td>
                <td className="px-3 py-2.5 font-medium">{e.vendor}</td>
                <td className="px-3 py-2.5 text-xs">{e.actor_email}</td>
                <td className="px-3 py-2.5"><Badge variant="info">{e.field}</Badge></td>
                <td className="px-3 py-2.5 font-mono text-xs">{e.variant_id ?? "—"}</td>
                <td className="px-3 py-2.5 tabular-nums">
                  <span className="text-muted-foreground line-through">{e.old_value ?? "—"}</span>
                  <span className="mx-1.5 text-muted-foreground">→</span>
                  <span className="font-medium">{e.new_value ?? "—"}</span>
                </td>
                <td className="px-3 py-2.5">
                  {e.final_status === "success" ? <Badge variant="success">success</Badge>
                    : <Badge variant="destructive">{e.final_status ?? "?"}</Badge>}
                  {e.superseded_at && <Badge variant="outline" className="ml-1">synced</Badge>}
                </td>
                <td className="px-3 py-2.5 text-xs text-destructive">{e.error_message ?? ""}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
