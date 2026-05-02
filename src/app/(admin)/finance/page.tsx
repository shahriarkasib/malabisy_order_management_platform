import { Suspense } from "react";
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
import { DailyNetChart, MonthlyChart } from "@/components/admin/finance-charts";
import { CsvDownload } from "@/components/admin/csv-download";
import { Badge } from "@/components/ui/badge";
import { Clock, Banknote, Wallet, AlertCircle } from "lucide-react";
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

      {tab === "overview" && (
        <Suspense key={`ov-${suspenseKey(filter)}`} fallback={<OverviewSkeleton />}>
          <OverviewTab filter={filter} />
        </Suspense>
      )}
      {tab === "orders" && (
        <Suspense key={`or-${suspenseKey(filter)}`} fallback={<TableSkeleton rows={10} cols={9} />}>
          <OrdersTab filter={filter} />
        </Suspense>
      )}
      {tab === "vendors" && (
        <Suspense key={`ve-${suspenseKey(filter)}`} fallback={<TableSkeleton rows={8} cols={8} />}>
          <VendorsTab filter={filter} />
        </Suspense>
      )}
    </div>
  );
}

function suspenseKey(f: FinanceFilter): string {
  return `${f.startDate ?? ""}|${f.endDate ?? ""}|${f.courier}|${f.vendor ?? ""}`;
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

function OverviewTab({ filter }: { filter: FinanceFilter }) {
  // Each section streams independently — slow query in one shouldn't block others.
  return (
    <div className="space-y-6">
      <Suspense fallback={<SummaryCardsSkeleton />}>
        <SummaryAndFeeSection filter={filter} />
      </Suspense>
      <Suspense fallback={<ChartSkeleton title="Daily net received" />}>
        <DailyChartSection filter={filter} />
      </Suspense>
      <Suspense fallback={<ChartSkeleton title="Monthly cashflow" />}>
        <MonthlyChartSection filter={filter} />
      </Suspense>
      <Suspense fallback={<TableSkeleton rows={5} cols={3} title="Upcoming Bosta cashouts" />}>
        <UpcomingCashoutsSection filter={filter} />
      </Suspense>
    </div>
  );
}

async function SummaryAndFeeSection({ filter }: { filter: FinanceFilter }) {
  const summaryR = await safe("summary", () => fetchCashflowSummary(filter), EMPTY_SUMMARY);
  const summary = summaryR.value;
  const errors = summaryR.error ? [summaryR.error] : [];

  const windowLabel = filter.startDate && filter.endDate
    ? `${filter.startDate} → ${filter.endDate}`
    : filter.startDate
      ? `since ${filter.startDate}`
      : "last 30 days";
  const cards = [
    {
      label: `Already received`, sub: `Money in Malabisy's bank · delivered ${windowLabel}`,
      icon: Banknote, color: "emerald" as const,
      total: summary.total_received_egp, bosta: summary.bosta_received_egp, log: summary.logestechs_received_egp,
    },
    {
      label: `Pending`, sub: `Delivered ${windowLabel}, courier hasn't paid out yet`,
      icon: Clock, color: "amber" as const,
      total: summary.total_pending_egp, bosta: summary.bosta_pending_egp, log: summary.logestechs_pending_egp,
    },
  ];

  return (
    <div className="space-y-6">
      {errors.length > 0 && <ErrorBox errors={errors} />}
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.sub}</p>
                </div>
                <Icon className={c.color === "emerald" ? "size-4 shrink-0 text-emerald-500" : "size-4 shrink-0 text-amber-500"} />
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
      <FeeBreakdown summary={summary} />
    </div>
  );
}

async function DailyChartSection({ filter }: { filter: FinanceFilter }) {
  const r = await safe("daily", () => fetchDailyNet(filter), [] as DailyPoint[]);
  return (
    <>
      {r.error && <ErrorBox errors={[r.error]} />}
      <DailyNetChart points={r.value} />
    </>
  );
}

async function MonthlyChartSection({ filter }: { filter: FinanceFilter }) {
  const r = await safe("monthly", () => fetchMonthlyCashflow(12, filter), [] as MonthlyCashflowRow[]);
  return (
    <>
      {r.error && <ErrorBox errors={[r.error]} />}
      <MonthlyChart rows={r.value} />
    </>
  );
}

async function UpcomingCashoutsSection({ filter }: { filter: FinanceFilter }) {
  const r = await safe("upcoming", () => fetchUpcomingCashouts(21, filter), [] as UpcomingCashout[]);
  return (
    <>
      {r.error && <ErrorBox errors={[r.error]} />}
      <UpcomingCashoutsTable rows={r.value} />
    </>
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

      <div className="flex items-center justify-between gap-4">
        <div className="grid flex-1 grid-cols-3 gap-4">
          <SmallStat label="Gross COD"      value={formatCurrency(totals.cod, "EGP")}  hint={`${rows.length} deliveries`} />
          <SmallStat label="Courier fees"   value={formatCurrency(totals.fees, "EGP")} hint={totals.cod > 0 ? `${((totals.fees/totals.cod)*100).toFixed(1)}% of gross` : ""} />
          <SmallStat label="Net to Malabisy" value={formatCurrency(totals.net, "EGP")} hint={totals.cod > 0 ? `${((totals.net/totals.cod)*100).toFixed(1)}% kept` : ""} />
        </div>
        <CsvDownload
          rows={rows as unknown as Array<Record<string, unknown>>}
          filename={`finance-orders-${new Date().toISOString().slice(0, 10)}.csv`}
          columns={[
            { key: "delivered_at",      header: "Delivered" },
            { key: "order_name",        header: "Order" },
            { key: "tracking_number",   header: "Tracking" },
            { key: "courier",           header: "Courier" },
            { key: "vendors",           header: "Vendors" },
            { key: "customer_name",     header: "Customer" },
            { key: "state_value",       header: "Status" },
            { key: "cod",               header: "COD (EGP)" },
            { key: "fees",              header: "Fees (EGP)" },
            { key: "net",               header: "Net (EGP)" },
            { key: "next_cashout_date", header: "Cashout" },
          ]}
        />
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

      <div className="flex items-center justify-between gap-4">
        <div className="grid flex-1 grid-cols-3 gap-4">
          <SmallStat label="Vendors"      value={String(rows.length)}                          hint="with deliveries in window" />
          <SmallStat label="Total net"    value={formatCurrency(totals.net, "EGP")}            hint={`${formatCurrency(totals.cod, "EGP")} gross`} />
          <SmallStat label="Total fees"   value={formatCurrency(totals.fees, "EGP")}           hint={totals.cod > 0 ? `${((totals.fees/totals.cod)*100).toFixed(1)}% of gross` : ""} />
        </div>
        <CsvDownload
          rows={rows as unknown as Array<Record<string, unknown>>}
          filename={`finance-vendors-${new Date().toISOString().slice(0, 10)}.csv`}
          columns={[
            { key: "vendor",           header: "Vendor" },
            { key: "orders",           header: "Orders" },
            { key: "cod_share",        header: "Gross (EGP)" },
            { key: "fees_share",       header: "Fees (EGP)" },
            { key: "net_share",        header: "Net (EGP)" },
            { key: "bosta_share",      header: "Bosta (EGP)" },
            { key: "logestechs_share", header: "Logestechs (EGP)" },
          ]}
        />
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
              const drillUrl = `/finance?tab=orders&vendor=${encodeURIComponent(r.vendor)}`;
              return (
                <tr
                  key={r.vendor}
                  className="border-t border-border transition-colors hover:bg-accent/40"
                  title={`Click any cell to see ${r.orders} orders for ${r.vendor}`}
                >
                  <td className="px-3 py-2 font-medium">
                    <Link href={drillUrl} className="text-primary hover:underline">{r.vendor}</Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Link href={drillUrl} className="hover:underline">{r.orders.toLocaleString()}</Link>
                  </td>
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

// ============================================================================
// Skeletons (shown while server queries run)
// ============================================================================

function Shimmer({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-muted/60", className)} />;
}

function SummaryCardsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-6 space-y-3">
            <Shimmer className="h-3 w-48" />
            <Shimmer className="h-8 w-32" />
            <div className="grid grid-cols-2 gap-4 border-t border-border pt-3">
              <div className="space-y-1.5"><Shimmer className="h-3 w-12" /><Shimmer className="h-4 w-20" /></div>
              <div className="space-y-1.5"><Shimmer className="h-3 w-16" /><Shimmer className="h-4 w-20" /></div>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <Shimmer className="h-4 w-56" />
        <Shimmer className="h-3 w-72" />
        <Shimmer className="h-3 w-full" />
        <Shimmer className="h-3 w-full" />
      </div>
    </div>
  );
}

function ChartSkeleton({ title }: { title: string }) {
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{title}</h2>
        <Shimmer className="h-3 w-48" />
      </div>
      <Shimmer className="mt-6 h-56 w-full" />
    </section>
  );
}

function TableSkeleton({ rows, cols, title }: { rows: number; cols: number; title?: string }) {
  return (
    <section className={cn(title ? "rounded-xl border border-border bg-card p-6" : "")}>
      {title && (
        <div className="space-y-1">
          <h2 className="text-base font-semibold">{title}</h2>
          <Shimmer className="h-3 w-72" />
        </div>
      )}
      <div className={cn(title ? "mt-4" : "", "overflow-hidden rounded-lg border border-border bg-card")}>
        <div className="border-b border-border bg-muted/40 p-3">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: cols }).map((_, i) => <Shimmer key={i} className="h-3 w-20" />)}
          </div>
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="border-b border-border p-3 last:border-b-0">
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {Array.from({ length: cols }).map((_, c) => <Shimmer key={c} className="h-4 w-full max-w-24" />)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <SummaryCardsSkeleton />
      <ChartSkeleton title="Daily net received" />
      <ChartSkeleton title="Monthly cashflow" />
      <TableSkeleton rows={5} cols={3} title="Upcoming Bosta cashouts" />
    </div>
  );
}

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

function UpcomingCashoutsTable({ rows }: { rows: UpcomingCashout[] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Upcoming Bosta cashouts</h2>
          <p className="text-xs text-muted-foreground">
            Money Bosta will deposit to Malabisy's bank in the next 21 days. Each row is one promised deposit date —
            from <span className="font-mono">bosta.deliveries_detail.next_cashout_date</span> for delivered parcels (state=45).
            Logestechs doesn't expose a cashout date so it's not in this section.
          </p>
        </div>
        <Wallet className="size-4 shrink-0 text-muted-foreground" />
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

