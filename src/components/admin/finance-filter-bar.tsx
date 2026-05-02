"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";

const PERIODS = [
  { value: "today",       label: "Today" },
  { value: "last-7",      label: "Last 7 days" },
  { value: "last-30",     label: "Last 30 days" },
  { value: "this-month",  label: "This month" },
  { value: "last-month",  label: "Last month" },
  { value: "this-quarter",label: "This quarter" },
  { value: "ytd",         label: "Year to date" },
  { value: "all",         label: "All time" },
  { value: "custom",      label: "Custom range…" },
] as const;

const COURIERS = ["All", "Bosta", "Logestechs"] as const;

export function FinanceFilterBar({ vendors }: { vendors: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const period = params.get("period") ?? "last-30";
  const courier = params.get("courier") ?? "All";
  const vendor = params.get("vendor") ?? "";
  const customFrom = params.get("from") ?? "";
  const customTo   = params.get("to")   ?? "";

  // Local mirror so date inputs feel responsive while we debounce push.
  const [draftFrom, setDraftFrom] = useState(customFrom);
  const [draftTo,   setDraftTo]   = useState(customTo);
  useEffect(() => { setDraftFrom(customFrom); setDraftTo(customTo); }, [customFrom, customTo]);

  function navigate(next: URLSearchParams) {
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }
  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "All") next.delete(key); else next.set(key, value);
    navigate(next);
  }
  function setPeriod(v: string) {
    const next = new URLSearchParams(params.toString());
    next.set("period", v);
    if (v !== "custom") { next.delete("from"); next.delete("to"); }
    navigate(next);
  }
  function setCustomRange(from: string, to: string) {
    const next = new URLSearchParams(params.toString());
    next.set("period", "custom");
    if (from) next.set("from", from); else next.delete("from");
    if (to)   next.set("to",   to);   else next.delete("to");
    navigate(next);
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="h-10 rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        <select
          value={courier}
          onChange={(e) => setParam("courier", e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {COURIERS.map((c) => <option key={c} value={c}>{c === "All" ? "All couriers" : c}</option>)}
        </select>

        <select
          value={vendor}
          onChange={(e) => setParam("vendor", e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All vendors</option>
          {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      {period === "custom" && (
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground">From</span>
          <Input
            type="date"
            value={draftFrom}
            onChange={(e) => { setDraftFrom(e.target.value); setCustomRange(e.target.value, draftTo); }}
            className="h-9 w-40"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={draftTo}
            onChange={(e) => { setDraftTo(e.target.value); setCustomRange(draftFrom, e.target.value); }}
            className="h-9 w-40"
          />
        </div>
      )}
    </div>
  );
}
