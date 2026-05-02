import type { Metadata } from "next";
import { requireInternal } from "@/lib/auth/server";
import { fetchAdminAccounts, fetchSystemStatus } from "@/lib/bigquery/settings-queries";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Clock } from "lucide-react";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

function freshness(minutesAgo: number | null, healthyMaxMinutes: number) {
  if (minutesAgo === null) return { label: "no data", variant: "outline" as const, icon: AlertCircle };
  if (minutesAgo <= healthyMaxMinutes) return { label: `${minutesAgo}m ago`, variant: "success" as const, icon: CheckCircle2 };
  if (minutesAgo <= healthyMaxMinutes * 3) return { label: `${minutesAgo}m ago`, variant: "warning" as const, icon: Clock };
  return { label: `${minutesAgo}m ago`, variant: "destructive" as const, icon: AlertCircle };
}

export default async function SettingsPage() {
  const session = await requireInternal();
  const [admins, status] = await Promise.all([fetchAdminAccounts(), fetchSystemStatus()]);

  const dataSources = [
    { name: "Warehouse query (gold rebuild)", minutesAgo: status.last_warehouse_run_minutes_ago, healthy: 70, expected: "every 1 hour" },
    { name: "Bosta sync",                      minutesAgo: status.last_bosta_sync_minutes_ago,    healthy: 30, expected: "every 15-30 min" },
    { name: "Shopify webhook (last event)",    minutesAgo: status.last_shopify_webhook_minutes_ago, healthy: 60, expected: "live, on order changes" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          System status, admin team, and data source health.
        </p>
      </div>

      {/* Your account */}
      <section className="rounded-xl border border-border bg-card p-6 space-y-3">
        <div>
          <h2 className="text-base font-semibold">Your account</h2>
          <p className="text-xs text-muted-foreground">Signed in via email allowlist (no password). Migrate to Clerk for production.</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="font-medium">{session.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Name</dt>
            <dd className="font-medium">{session.display_name || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Role</dt>
            <dd><Badge variant="info">{session.role}</Badge></dd>
          </div>
        </dl>
      </section>

      {/* Data freshness */}
      <section className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold">Data freshness</h2>
          <p className="text-xs text-muted-foreground">Last refresh of each upstream pipeline.</p>
        </div>
        <div className="space-y-2">
          {dataSources.map((src) => {
            const f = freshness(src.minutesAgo, src.healthy);
            const Icon = f.icon;
            return (
              <div key={src.name} className="flex items-center justify-between rounded-md border border-border bg-background px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <Icon className={
                    f.variant === "success" ? "size-4 text-emerald-500"
                    : f.variant === "warning" ? "size-4 text-amber-500"
                    : "size-4 text-destructive"
                  } />
                  <div>
                    <p className="text-sm font-medium">{src.name}</p>
                    <p className="text-xs text-muted-foreground">Expected: {src.expected}</p>
                  </div>
                </div>
                <Badge variant={f.variant}>{f.label}</Badge>
              </div>
            );
          })}
        </div>
      </section>

      {/* Volume snapshot */}
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-base font-semibold">Volume snapshot</h2>
        <p className="text-xs text-muted-foreground">Counts across the data warehouse, refreshed on every page load.</p>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Shopify orders (Airbyte)", value: status.shopify_orders_count },
            { label: "Realtime orders (webhook)", value: status.shopify_realtime_orders },
            { label: "Realtime line items", value: status.shopify_realtime_line_items },
            { label: "Bosta deliveries", value: status.bosta_deliveries_count },
            { label: "Vendor users", value: status.vendor_users_count },
            { label: "Vendor edits (30d)", value: status.vendor_edits_30d },
            { label: "Ops actions (30d)", value: status.ops_actions_30d },
          ].map((s) => (
            <div key={s.label} className="rounded-md bg-muted/40 p-3">
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
              <dd className="mt-1 text-xl font-bold tabular-nums">{s.value.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Admin accounts */}
      <section className="rounded-xl border border-border bg-card p-6 space-y-3">
        <div>
          <h2 className="text-base font-semibold">Admin team</h2>
          <p className="text-xs text-muted-foreground">
            Admins can see every page and edit on every vendor's behalf. Add/remove via direct row in <code>ops.vendor_accounts</code>.
          </p>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Active</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium">Last login</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.email} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{a.email}</td>
                  <td className="px-3 py-2">{a.display_name || "—"}</td>
                  <td className="px-3 py-2">
                    {a.active ? <Badge variant="success">active</Badge> : <Badge variant="destructive">disabled</Badge>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{formatDateTime(a.created_at)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{a.last_login_at ? formatDateTime(a.last_login_at) : "never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pipeline links */}
      <section className="rounded-xl border border-border bg-card p-6 space-y-2">
        <h2 className="text-base font-semibold">Quick links</h2>
        <ul className="text-sm space-y-1 text-muted-foreground">
          <li>
            <a className="text-primary hover:underline" href="https://console.cloud.google.com/bigquery?project=malabisy-data" target="_blank" rel="noreferrer">
              BigQuery console (malabisy-data)
            </a>
          </li>
          <li>
            <a className="text-primary hover:underline" href="https://console.cloud.google.com/functions/list?project=malabisy-data" target="_blank" rel="noreferrer">
              Cloud Functions
            </a>
          </li>
          <li>
            <a className="text-primary hover:underline" href="https://console.cloud.google.com/bigquery/scheduled-queries?project=malabisy-data" target="_blank" rel="noreferrer">
              Scheduled queries (warehouse_query, dedup, etc.)
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}
