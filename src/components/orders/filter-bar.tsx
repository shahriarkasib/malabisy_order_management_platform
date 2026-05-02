"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  vendors: string[];
}

const DIRECTIONS = ["All", "Forward", "Reverse"] as const;
const PAYMENTS = ["All", "COD", "Prepaid"] as const;

/**
 * Date range presets. The value is a key the page reads from `?period=...`.
 * Resolution to actual ISO dates happens server-side in src/app/orders/page.tsx
 * so the URL stays human-readable ("?period=this-month") instead of full dates.
 */
const PERIODS = [
  { value: "all",         label: "All time" },
  { value: "today",       label: "Today" },
  { value: "yesterday",   label: "Yesterday" },
  { value: "last-7",      label: "Last 7 days" },
  { value: "last-30",     label: "Last 30 days" },
  { value: "this-month",  label: "This month" },
  { value: "last-month",  label: "Last month" },
  { value: "this-quarter", label: "This quarter" },
  { value: "last-quarter", label: "Last quarter" },
  { value: "ytd",         label: "Year to date" },
  { value: "custom",      label: "Custom range…" },
] as const;

export function FilterBar({ vendors }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState(params.get("search") ?? "");
  const vendor = params.get("vendor") ?? "";
  const direction = params.get("direction") ?? "All";
  const payment = params.get("payment") ?? "All";
  const period = params.get("period") ?? "all";
  const customFrom = params.get("from") ?? "";
  const customTo = params.get("to") ?? "";

  useEffect(() => {
    const handle = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (search) next.set("search", search);
      else next.delete("search");
      const target = `?${next.toString()}`;
      const current = `?${params.toString()}`;
      if (target !== current) startTransition(() => router.replace(target));
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "All") next.delete(key);
    else next.set(key, value);
    startTransition(() => router.replace(`?${next.toString()}`));
  }

  function setPeriod(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "all") {
      next.delete("period");
      next.delete("from");
      next.delete("to");
    } else {
      next.set("period", value);
      // Switching away from custom drops any leftover date params.
      if (value !== "custom") {
        next.delete("from");
        next.delete("to");
      }
    }
    startTransition(() => router.replace(`?${next.toString()}`));
  }

  function setCustomRange(from: string, to: string) {
    const next = new URLSearchParams(params.toString());
    next.set("period", "custom");
    if (from) next.set("from", from);
    else next.delete("from");
    if (to) next.set("to", to);
    else next.delete("to");
    startTransition(() => router.replace(`?${next.toString()}`));
  }

  function clearAll() {
    setSearch("");
    const next = new URLSearchParams();
    if (params.get("tab")) next.set("tab", params.get("tab")!);
    startTransition(() => router.replace(`?${next.toString()}`));
  }

  const hasFilters = search || vendor || direction !== "All" || payment !== "All" || period !== "all";

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, customer, phone, tracking, SKU…"
            className="pl-9"
          />
        </div>

        <div className="relative">
          <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="h-10 rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <select
          value={vendor}
          onChange={(e) => setParam("vendor", e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All vendors ({vendors.length})</option>
          {vendors.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>

        <select
          value={direction}
          onChange={(e) => setParam("direction", e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {DIRECTIONS.map((d) => (
            <option key={d} value={d}>{d === "All" ? "All directions" : d}</option>
          ))}
        </select>

        <select
          value={payment}
          onChange={(e) => setParam("payment", e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {PAYMENTS.map((p) => (
            <option key={p} value={p}>{p === "All" ? "All payments" : p}</option>
          ))}
        </select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <X /> Clear
          </Button>
        )}
      </div>

      {period === "custom" && (
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground">From</span>
          <Input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomRange(e.target.value, customTo)}
            className="h-9 w-40"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={customTo}
            onChange={(e) => setCustomRange(customFrom, e.target.value)}
            className="h-9 w-40"
          />
        </div>
      )}
    </div>
  );
}
