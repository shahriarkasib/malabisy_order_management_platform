"use client";

import {
  ResponsiveContainer,
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { TrendingUp } from "lucide-react";
import type { DailyPoint } from "@/lib/bigquery/finance-detail-queries";
import type { MonthlyCashflowRow } from "@/lib/bigquery/finance-queries";

const fmtEgp = (v: number) =>
  new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(v);

const COLORS = {
  bosta: "#10b981",      // emerald-500
  logestechs: "#f59e0b", // amber-500
};

export function DailyNetChart({ points }: { points: DailyPoint[] }) {
  if (points.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-base font-semibold">Daily net received</h2>
        <p className="mt-2 text-sm text-muted-foreground">No deliveries in the selected window.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Daily net received</h2>
          <p className="text-xs text-muted-foreground">{points.length} days · stacked by courier.</p>
        </div>
        <TrendingUp className="size-4 text-muted-foreground" />
      </div>
      <div className="mt-4 h-[280px] w-full">
        <ResponsiveContainer>
          <AreaChart data={points}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))"
                   tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
              formatter={(v: unknown) => fmtEgp(typeof v === "number" ? v : 0)}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="bosta"      stackId="1" name="Bosta"      stroke={COLORS.bosta}      fill={COLORS.bosta}      fillOpacity={0.3} />
            <Area type="monotone" dataKey="logestechs" stackId="1" name="Logestechs" stroke={COLORS.logestechs} fill={COLORS.logestechs} fillOpacity={0.3} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function MonthlyChart({ rows }: { rows: MonthlyCashflowRow[] }) {
  if (rows.length === 0) return null;
  // Recharts wants oldest → newest left to right.
  const data = [...rows].reverse().map((r) => ({
    month: r.month,
    bosta: r.bosta_net,
    logestechs: r.logestechs_net,
    total: r.total_net_egp,
  }));
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Monthly net received</h2>
          <p className="text-xs text-muted-foreground">Last {rows.length} months · stacked by courier.</p>
        </div>
        <TrendingUp className="size-4 text-muted-foreground" />
      </div>
      <div className="mt-4 h-[280px] w-full">
        <ResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))"
                   tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
              formatter={(v: unknown) => fmtEgp(typeof v === "number" ? v : 0)}
            />
            <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="bosta"      stackId="1" name="Bosta"      fill={COLORS.bosta} />
            <Bar dataKey="logestechs" stackId="1" name="Logestechs" fill={COLORS.logestechs} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
