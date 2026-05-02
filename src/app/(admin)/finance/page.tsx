import type { Metadata } from "next";
import {
  fetchCashflowSummary,
  fetchMonthlyCashflow,
  fetchUpcomingCashouts,
} from "@/lib/bigquery/finance-queries";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Clock, Banknote, Wallet } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Finance" };
export const dynamic = "force-dynamic";

function fmtUSD(egp: number, rate: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(egp / rate);
}

export default async function FinancePage() {
  const [summary, monthly, upcoming] = await Promise.all([
    fetchCashflowSummary(),
    fetchMonthlyCashflow(12),
    fetchUpcomingCashouts(21),
  ]);

  const cards = [
    {
      label: "Already received (last 30d)",
      bosta: summary.bosta_received_egp,
      logestechs: summary.logestechs_received_egp,
      total: summary.total_received_egp,
      icon: Banknote,
      color: "emerald",
    },
    {
      label: "Pending — delivered, awaiting cashout",
      bosta: summary.bosta_pending_egp,
      logestechs: summary.logestechs_pending_egp,
      total: summary.total_pending_egp,
      icon: Clock,
      color: "amber",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Finance</h1>
        <p className="text-sm text-muted-foreground">
          Money collected by couriers and what's coming to Malabisy's bank · 1 USD ≈ {summary.egp_per_usd} EGP
        </p>
      </div>

      {/* Top: received + pending */}
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{c.label}</p>
                <Icon className={`size-4 ${c.color === "emerald" ? "text-emerald-500" : "text-amber-500"}`} />
              </div>
              <p className="mt-3 text-3xl font-bold tabular-nums">
                {formatCurrency(c.total, "EGP")}
              </p>
              <p className="text-xs text-muted-foreground">≈ {fmtUSD(c.total, summary.egp_per_usd)}</p>
              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Bosta</p>
                  <p className="font-semibold tabular-nums">{formatCurrency(c.bosta, "EGP")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Logestechs</p>
                  <p className="font-semibold tabular-nums">{formatCurrency(c.logestechs, "EGP")}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Fee breakdown */}
      <section className="rounded-xl border border-border bg-card p-6 space-y-3">
        <div>
          <h2 className="text-base font-semibold">Where the money went (last 30d)</h2>
          <p className="text-xs text-muted-foreground">For every EGP customers paid — what reached Malabisy vs courier fees.</p>
        </div>
        <FeeBar
          label="Bosta"
          gross={summary.bosta_gross_30d_egp}
          fees={summary.bosta_fees_30d_egp}
        />
        <FeeBar
          label="Logestechs"
          gross={summary.logestechs_gross_30d_egp}
          fees={summary.logestechs_fees_30d_egp}
        />
      </section>

      {/* Monthly trend */}
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
                <th className="px-3 py-2 text-right font-medium">Total EGP</th>
                <th className="px-3 py-2 text-right font-medium">Total USD</th>
              </tr>
            </thead>
            <tbody>
              {monthly.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-12 text-center text-muted-foreground">No data yet.</td></tr>
              ) : monthly.map((m) => (
                <tr key={m.month} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{m.month}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(m.bosta_net, "EGP")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(m.logestechs_net, "EGP")}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatCurrency(m.total_net_egp, "EGP")}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {fmtUSD(m.total_net_egp, summary.egp_per_usd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Upcoming Bosta cashouts */}
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
                <th className="px-3 py-2 text-right font-medium">Net EGP</th>
                <th className="px-3 py-2 text-right font-medium">≈ USD</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-12 text-center text-muted-foreground">No upcoming cashouts in the next 21 days.</td></tr>
              ) : upcoming.map((u) => (
                <tr key={u.cashout_date} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">
                    {formatDate(u.cashout_date)} <Badge variant="outline" className="ml-1">{u.cashout_date}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{u.parcels.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatCurrency(u.expected_net_egp, "EGP")}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtUSD(u.expected_net_egp, summary.egp_per_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function FeeBar({ label, gross, fees }: { label: string; gross: number; fees: number }) {
  if (gross <= 0) {
    return (
      <div className="space-y-1">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">No deliveries in this window.</span>
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
        <div className="bg-emerald-500" style={{ width: `${netPct}%` }} title={`Net: ${formatCurrency(net, "EGP")}`} />
        <div className="bg-amber-500" style={{ width: `${feePct}%` }} title={`Fees: ${formatCurrency(fees, "EGP")}`} />
      </div>
    </div>
  );
}
