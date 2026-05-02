import type { Metadata } from "next";
import { requireInternal } from "@/lib/auth/server";
import { fetchAdminAccounts, fetchSystemStatus } from "@/lib/bigquery/settings-queries";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { RefreshButton } from "@/components/admin/refresh-button";
import { AdminsTable } from "@/components/admin/admins-table";

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

  const dataSources: Array<{
    name: string;
    minutesAgo: number | null;
    healthy: number;
    expected: string;
    refresh: "warehouse" | "shopify" | "bosta" | null;
  }> = [
    { name: "Warehouse query (gold rebuild)", minutesAgo: status.last_warehouse_run_minutes_ago, healthy: 70, expected: "every 1 hour",      refresh: "warehouse" },
    { name: "Bosta sync",                      minutesAgo: status.last_bosta_sync_minutes_ago,    healthy: 30, expected: "every 15-30 min",  refresh: "bosta" },
    { name: "Shopify webhook (last event)",    minutesAgo: status.last_shopify_webhook_minutes_ago, healthy: 60, expected: "live, on order changes", refresh: null },
    { name: "Shopify bulk sync (CF)",          minutesAgo: null,                                  healthy: 720, expected: "every 6 hours",   refresh: "shopify" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Your account, data freshness, and admin team.</p>
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

      {/* Data freshness with manual triggers */}
      <section className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold">Data freshness</h2>
          <p className="text-xs text-muted-foreground">Each pipeline runs on its own schedule. Click "Refresh now" to trigger immediately.</p>
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
                    : f.variant === "destructive" ? "size-4 text-destructive"
                    : "size-4 text-muted-foreground"
                  } />
                  <div>
                    <p className="text-sm font-medium">{src.name}</p>
                    <p className="text-xs text-muted-foreground">Expected: {src.expected}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={f.variant}>{f.label}</Badge>
                  {src.refresh && <RefreshButton source={src.refresh} label={src.name} />}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Admin team */}
      <section className="rounded-xl border border-border bg-card p-6 space-y-3">
        <div>
          <h2 className="text-base font-semibold">Admin team</h2>
          <p className="text-xs text-muted-foreground">
            Admins can see every page, manage vendors, and trigger pipelines. You can't remove yourself.
          </p>
        </div>
        <AdminsTable admins={admins} currentUserEmail={session.email} />
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
