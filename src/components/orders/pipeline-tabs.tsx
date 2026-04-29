"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn, formatNumber } from "@/lib/utils";
import { PIPELINE_TABS } from "@/lib/constants";
import type { TabCount } from "@/types/order";

interface Props {
  counts: TabCount[];
}

export function PipelineTabs({ counts }: Props) {
  const params = useSearchParams();
  const active = params.get("tab") ?? "All Orders";
  const lookup = new Map(counts.map((c) => [c.pipeline_tab, c.count]));
  const total = counts.reduce((s, c) => s + c.count, 0);

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card p-1.5">
      <nav className="flex gap-1">
        {PIPELINE_TABS.map((tab) => {
          const count = tab === "All Orders" ? total : (lookup.get(tab) ?? 0);
          const isActive = active === tab;
          const search = new URLSearchParams(params);
          search.set("tab", tab);
          return (
            <Link
              key={tab}
              href={`?${search.toString()}`}
              className={cn(
                "group flex items-center gap-2 whitespace-nowrap rounded-md px-3.5 py-2 text-sm font-medium transition-all",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <span>{tab}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors",
                  isActive
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground group-hover:bg-background",
                )}
              >
                {formatNumber(count)}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
