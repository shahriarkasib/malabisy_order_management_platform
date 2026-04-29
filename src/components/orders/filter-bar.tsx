"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  vendors: string[];
}

const DIRECTIONS = ["All", "Forward", "Reverse"] as const;
const PAYMENTS = ["All", "COD", "Prepaid"] as const;

export function FilterBar({ vendors }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState(params.get("search") ?? "");
  const vendor = params.get("vendor") ?? "";
  const direction = params.get("direction") ?? "All";
  const payment = params.get("payment") ?? "All";

  // Debounced search → URL
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

  function clearAll() {
    setSearch("");
    const next = new URLSearchParams();
    if (params.get("tab")) next.set("tab", params.get("tab")!);
    startTransition(() => router.replace(`?${next.toString()}`));
  }

  const hasFilters = search || vendor || direction !== "All" || payment !== "All";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
      <div className="relative min-w-[260px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order #, customer, phone, tracking, SKU…"
          className="pl-9"
        />
      </div>

      <select
        value={vendor}
        onChange={(e) => setParam("vendor", e.target.value)}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">All vendors ({vendors.length})</option>
        {vendors.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>

      <select
        value={direction}
        onChange={(e) => setParam("direction", e.target.value)}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {DIRECTIONS.map((d) => (
          <option key={d} value={d}>
            {d === "All" ? "All directions" : d}
          </option>
        ))}
      </select>

      <select
        value={payment}
        onChange={(e) => setParam("payment", e.target.value)}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {PAYMENTS.map((p) => (
          <option key={p} value={p}>
            {p === "All" ? "All payments" : p}
          </option>
        ))}
      </select>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll}>
          <X /> Clear
        </Button>
      )}
    </div>
  );
}
