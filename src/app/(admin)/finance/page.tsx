import type { Metadata } from "next";
import Link from "next/link";
import {
  fetchCashflowSummary,
  fetchMonthlyCashflow,
  fetchUpcomingCashouts,
  type CashflowSummary,
  type MonthlyCashflowRow,
  type UpcomingCashout,
} from "@/lib/bigquery/finance-queries";
import {
  fetchFinanceOrders,
  fetchFinanceByVendor,
  fetchDailyNet,
  type FinanceFilter,
  type OrderRow,
  type VendorRow,
  type DailyPoint,
} from "@/lib/bigquery/finance-detail-queries";
import { fetchVendors } from "@/lib/bigquery/queries";
import { resolvePeriod } from "@/lib/period";
import { FinanceFilterBar } from "@/components/admin/finance-filter-bar";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Clock, Banknote, Wallet, AlertCircle } from "lucide-react";
import { formatCurrency, formatDate, cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Finance" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    tab?: string;
    period?: string;
    from?: string;
    to?: string;
    courier?: string;
    vendor?: string;
  }>;
}

const EMPTY_SUMMARY: CashflowSummary = {
  bosta_received_egp: 0, bosta_pending_egp: 0,
  bosta_fees_30d_egp: 0, bosta_gross_30d_egp: 0,
  logestechs_received_egp: 0, logestechs_pending_egp: 0,
  logestechs_fees_30d_egp: 0, logestechs_gross_30d_egp: 0,
  total_received_egp: 0, total_pending_egp: 0,
  egp_per_usd: 49,
};

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<{ value: T; error?: string }> {
  try { return { value: await fn() }; }
  catch (e) { console.error(`[finance/${label}]`, e); return { value: fallback, error: `${label}: ${(e as Error).message}` }; }
}

export default async function FinancePage({ searchParams }: Props) {
  const sp = await searchParams;
  const tab = sp.tab === "orders" || sp.tab === "vendors" ? sp.tab : "overview";
  const range = resolvePeriod(sp.period ?? "last-30", sp.from, sp.to);
  const filter: FinanceFilter = {
    startDate: range?.startDate,
    endDate: range?.endDate,
    courier: sp.courier === "Bosta" || sp.courier === "Logestechs" ? sp.courier : "All",
    vendor: sp.vendor || undefined,
  };

  // Vendors list for the filter dropdown — small, cached, safe to fetch every render.
  const vendorsR = await safe("vendors", () => fetchVendors(), [] as string[]);
  const vendors = vendorsR.value;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Finance</h1>
        <p className="text-sm text-muted-foreground">Money collected by couriers and what's coming to Malabisy's bank.</p>
      </div>

      <FinanceFilterBar vendors={vendors} />

      <div className="flex gap-1 rounded-lg border border-border bg-card p-1 w-fit">
        <TabLink href={withParams(sp, "tab", null)}     active={tab === "overview"} label="Overview" />
        <TabLink href={withParams(sp, "tab", "orders")} active={tab === "orders"}   label="Orders" />
        <TabLink href={withParams(sp, "tab", "vendors")} active={tab === "vendors"} label="Vendors" />
      </div>

      {tab === "overview"  && <OverviewTab filter={filter} />}
      {tab === "orders"    && <OrdersTab   filter={filter} />}
      {tab === "vendors"   && <VendorsTab  filter={filter} />}
    </div>
  );
}

function TabLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

function withParams(current: Record<string, string | undefined>, key: string, value: string | null): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (v && k !== key) params.set(k, v);
  }
  if (value !== null) params.set(key, value);
  const qs = params.toString();
  return `/finance${qs ? `?${qs}` : ""}`;
}


// ============================================================================
// Overview tab
// ============================================================================

async function OverviewTab({ filter }: { filter: FinanceFilter }) {
  const [summaryR, monthlyR, upcomingR, dailyR] = await Promise.all([
    safe("summary",  () => fetchCashflowSummary(),    EMPTY_SUMMARY),
    safe("monthly",  () => fetchMonthlyCashflow(12),  [] as MonthlyCashflowRow[]),
    safe("upcoming", () => fetchUpcomingCashouts(21), [] as UpcomingCashout[]),
    safe("daily",    () => fetchDailyNet(filter),     [] as DailyPoint[]),
  ]);
  const summary = summaryR.value;
  const monthly = monthlyR.value;
  const upcoming = upcomingR.value;
  const daily = dailyR.value;
  const errors = [summaryR.error, monthlyR.error, upcomingR.error, dailyR.error].filter(Boolean) as string[];

  const cards = [
    { label: "Already received", icon: Banknote, color: "emerald" as const,
      total: summary.total_received_egp, bosta: summary.bosta_received_egp, log: summary.logestechs_received_egp },
    { label: "Pending — delivered, awaiting cashout", icon: Clock, color: "amber" as const,
      total: summary.total_pending_egp, bosta: summary.bosta_pending_egp, log: summary.logestechs_pending_egp },
  ];

  return (
    <div className="space-y-6">
      {errors.length > 0 && <ErrorBox errors={errors} />}

      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{c.label}</p>
                <Icon className={c.color === "emerald" ? "size-4 text-emerald-500" : "size-4 text-amber-500"} />
              </div>
              <p className="mt-3 text-3xl font-bold tabular-nums">{formatCurrency(c.total, "EGP")}</p>
              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Bosta</p>
                  <p className="font-semibold tabular-nums">{formatCurrency(c.bosta, "EGP")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Logestechs</p>
                  <p className="font-semibold tabular-nums">{formatCurrency(c.log, "EGP")}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <DailyChart points={daily} />

      <FeeBreakdown summary={summary} />

      <MonthlyTable rows={monthly} />

      <UpcomingCashoutsTable rows={upcoming} />
    </div>
  );
}


// ============================================================================
// Orders tab — per-delivery detail
// ============================================================================

async function OrdersTab({ filter }: { filter: FinanceFilter }) {
  const ordersR = await safe("orders", () => fetchFinanceOrders(filter, 500), [] as OrderRow[]);
  const errors = [ordersR.error].filter(Boolean) as string[];
  const rows = ordersR.value;

  const totals = rows.reduce(
    (acc, r) => { acc.cod += r.cod; acc.fees += r.fees; acc.net += r.net; return acc; },
    { cod: 0, fees: 0, net: 0 },
  );

  return (
    <div className="space-y-4">
      {errors.length > 0 && <ErrorBox errors={errors} />}

      <div className="grid grid-cols-3 gap-4">
        <SmallStat label="Gross COD"      value={formatCurrency(totals.cod, "EGP")}  hint={`${rows.length} deliveries`} />
        <SmallStat label="Courier fees"   value={formatCurrency(totals.fees, "EGP")} hint={totals.cod > 0 ? `${((totals.fees/totals.cod)*100).toFixed(1)}% of gross` : ""} />
        <SmallStat label="Net to Malabisy" value={formatCurrency(totals.net, "EGP")} hint={totals.cod > 0 ? `${((totals.net/totals.cod)*100).toFixed(1)}% kept` : ""} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2.5 font-medium">Delivered</th>
              <th className="px-3 py-2.5 font-medium">Order</th>
              <th className="px-3 py-2.5 font-medium">Tracking</th>
              <th className="px-3 py-2.5 font-medium">Courier</th>
              <th className="px-3 py-2.5 font-medium">Vendor(s)</th>
              <th className="px-3 py-2.5 text-right font-medium">COD</th>
              <th className="px-3 py-2.5 text-right font-medium">Fees</th>
              <th className="px-3 py-2.5 text-right font-medium">Net</th>
              <th className="px-3 py-2.5 font-medium">Cashout</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-12 text-center text-muted-foreground">No deliveries match the filters.</td></tr>
            ) : rows.map((r) => (
              <tr key={`${r.courier}-${r.delivery_id}`} className="border-t border-border hover:bg-accent/30">
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.delivered_at ? formatDate(r.delivered_at) : "—"}</td>
                <td className="px-3 py-2 font-medium">{r.order_name || "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.tracking_number || "—"}</td>
                <td className="px-3 py-2"><Badge variant={r.courier === "Bosta" ? "info" : "outline"}>{r.courier}</Badge></td>
                <td className="px-3 py-2 text-xs">{r.vendors || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.cod, "EGP")}</td>
                <td className="px-3 py-2 text-right tabular-nums text-amber-600">{formatCurrency(r.fees, "EGP")}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-600">{formatCurrency(r.net, "EGP")}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.next_cashout_date ? formatDate(r.next_cashout_date) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 500 && (
        <p className="text-xs text-muted-foreground">Showing first 500 — narrow the date range to see the rest.</p>
      )}
    </div>
  );
}


// ============================================================================
// Vendors tab — per-vendor allocation
// ============================================================================

async function VendorsTab({ filter }: { filter: FinanceFilter }) {
  const vendorsR = await safe("vendors", () => fetchFinanceByVendor(filter), [] as VendorRow[]);
  const errors = [vendorsR.error].filter(Boolean) as string[];
  const rows = vendorsR.value;

  const totals = rows.reduce(
    (acc, r) => { acc.cod += r.cod_share; acc.fees += r.fees_share; acc.net += r.net_share; return acc; },
    { cod: 0, fees: 0, net: 0 },
  );
  const maxNet = Math.max(...rows.map((r) => r.net_share), 1);

  return (
    <div className="space-y-4">
      {errors.length > 0 && <ErrorBox errors={errors} />}

      <div className="grid grid-cols-3 gap-4">
        <SmallStat label="Vendors"      value={String(rows.length)}                          hint="with deliveries in window" />
        <SmallStat label="Total net"    value={formatCurrency(totals.net, "EGP")}            hint={`${formatCurrency(totals.cod, "EGP")} gross`} />
        <SmallStat label="Total fees"   value={formatCurrency(totals.fees, "EGP")}           hint={totals.cod > 0 ? `${((totals.fees/totals.cod)*100).toFixed(1)}% of gross` : ""} />
      </div>

      <p className="text-xs text-muted-foreground">
        When an order has line items from multiple vendors, the courier's net is allocated proportionally
        by each vendor's share of the order subtotal.
      </p>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2.5 font-medium">Vendor</th>
              <th className="px-3 py-2.5 text-right font-medium">Orders</th>
              <th className="px-3 py-2.5 text-right font-medium">Gross</th>
              <th className="px-3 py-2.5 text-right font-medium">Fees</th>
              <th className="px-3 py-2.5 text-right font-medium">Net</th>
              <th className="px-3 py-2.5 font-medium">Net share</th>
              <th className="px-3 py-2.5 text-right font-medium">Bosta</th>
              <th className="px-3 py-2.5 text-right font-medium">Logestechs</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">No vendor activity in this window.</td></tr>
            ) : rows.map((r) => {
              const widthPct = (r.net_share / maxNet) * 100;
              return (
                <tr key={r.vendor} className="border-t border-border hover:bg-accent/30">
                  <td className="px-3 py-2 font-medium">{r.vendor}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.orders.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.cod_share, "EGP")}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-600">{formatCurrency(r.fees_share, "EGP")}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-600">{formatCurrency(r.net_share, "EGP")}</td>
                  <td className="px-3 py-2 min-w-[140px]">
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${widthPct}%` }} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">{formatCurrency(r.bosta_share, "EGP")}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">{formatCurrency(r.logestechs_share, "EGP")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ============================================================================
// Helpers
// ============================================================================

function ErrorBox({ errors }: { errors: string[] }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-2">
      <div className="flex items-center gap-2 text-destructive">
        <AlertCircle className="size-4" />
        <p className="text-sm font-semibold">{errors.length} query failed — showing defaults</p>
      </div>
      {errors.map((err, i) => (
        <pre key={i} className="overflow-x-auto whitespace-pre-wrap break-all text-xs text-destructive/80">{err}</pre>
      ))}
    </div>
  );
}

function SmallStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function FeeBreakdown({ summary }: { summary: CashflowSummary }) {
  return (
    <section className="rounded-xl border border-border bg-card p-6 space-y-3">
      <div>
        <h2 className="text-base font-semibold">Where the money went (last 30d)</h2>
        <p className="text-xs text-muted-foreground">For every EGP customers paid — what reached Malabisy vs courier fees.</p>
      </div>
      <FeeBar label="Bosta"      gross={summary.bosta_gross_30d_egp}      fees={summary.bosta_fees_30d_egp} />
      <FeeBar label="Logestechs" gross={summary.logestechs_gross_30d_egp} fees={summary.logestechs_fees_30d_egp} />
    </section>
  );
}

function FeeBar({ label, gross, fees }: { label: string; gross: number; fees: number }) {
  if (gross <= 0) {
    return (
      <div className="space-y-1">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">No deliveries.</span>
        </div>
        <div className="h-3 rounded-full bg-muted" />
      </div>
    );
  }
  const feePct = (fees / gross) * 100;
  const netPct = 100 - feePct;
  const net = gross - fees;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">
          gross {formatCurrency(gross, "EGP")} = net {formatCurrency(net, "EGP")} ({netPct.toFixed(0)}%) + fees {formatCurrency(fees, "EGP")} ({feePct.toFixed(0)}%)
        </span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        <div className="bg-emerald-500" style={{ width: `${netPct}%` }} title={`Net ${formatCurrency(net, "EGP")}`} />
        <div className="bg-amber-500"   style={{ width: `${feePct}%` }} title={`Fees ${formatCurrency(fees, "EGP")}`} />
      </div>
    </div>
  );
}

function MonthlyTable({ rows }: { rows: MonthlyCashflowRow[] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Monthly net received</h2>
          <p className="text-xs text-muted-foreground">Last 12 months · what landed in Malabisy's bank.</p>
        </div>
        <TrendingUp className="size-4 text-muted-foreground" />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Month</th>
              <th className="px-3 py-2 text-right font-medium">Bosta</th>
              <th className="px-3 py-2 text-right font-medium">Logestechs</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-12 text-center text-muted-foreground">No data yet.</td></tr>
            ) : rows.map((m) => (
              <tr key={m.month} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{m.month}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(m.bosta_net, "EGP")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(m.logestechs_net, "EGP")}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatCurrency(m.total_net_egp, "EGP")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UpcomingCashoutsTable({ rows }: { rows: UpcomingCashout[] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Upcoming Bosta cashouts</h2>
          <p className="text-xs text-muted-foreground">Next 21 days · grouped by deposit date Bosta promised.</p>
        </div>
        <Wallet className="size-4 text-muted-foreground" />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Cashout date</th>
              <th className="px-3 py-2 text-right font-medium">Parcels</th>
              <th className="px-3 py-2 text-right font-medium">Expected net</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={3} className="px-3 py-12 text-center text-muted-foreground">No upcoming cashouts.</td></tr>
            ) : rows.map((u) => (
              <tr key={u.cashout_date} className="border-t border-border">
                <td className="px-3 py-2 font-medium">
                  {formatDate(u.cashout_date)} <Badge variant="outline" className="ml-1">{u.cashout_date}</Badge>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{u.parcels.toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatCurrency(u.expected_net_egp, "EGP")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DailyChart({ points }: { points: DailyPoint[] }) {
  if (points.length === 0) return null;
  const max = Math.max(...points.map((p) => p.total), 1);
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-base font-semibold">Daily net received</h2>
      <p className="text-xs text-muted-foreground">Stacked: green = Bosta, amber = Logestechs.</p>
      <div className="mt-4 grid items-end" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`, gap: 2, height: 160 }}>
        {points.map((p) => {
          const totalH = (p.total / max) * 100;
          const bostaH = p.total > 0 ? (p.bosta / p.total) * totalH : 0;
          const logH   = totalH - bostaH;
          return (
            <div key={p.date} className="group relative flex h-full flex-col-reverse" title={`${p.date}  Bosta: ${p.bosta.toLocaleString()}  Logestechs: ${p.logestechs.toLocaleString()}`}>
              <div className="bg-emerald-500" style={{ height: `${bostaH}%` }} />
              <div className="bg-amber-500"   style={{ height: `${logH}%` }} />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{points[0]?.date}</span>
        <span>peak day: {formatCurrency(max, "EGP")}</span>
        <span>{points[points.length - 1]?.date}</span>
      </div>
    </section>
  );
}
