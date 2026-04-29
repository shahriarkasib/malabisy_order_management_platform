"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrdersTable } from "./orders-table";
import { ActionBar } from "./action-bar";
import type { LineItem } from "@/types/order";

interface Props {
  data: LineItem[];
  /** TODO: replace with auth claim once Clerk is wired in. */
  actorEmail: string;
}

const REFRESH_INTERVAL_MS = 5_000;

export function OrdersPageClient({ data, actorEmail }: Props) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now());
  const selectedRows = data.filter((d) => selectedIds.has(d.line_item_id));

  // Reset the freshness timer whenever the server hands us a new payload.
  useEffect(() => {
    setLastRefreshed(Date.now());
  }, [data]);

  // Poll every 5s. Pause when the tab is backgrounded — the browser throttles
  // intervals there anyway, and we don't want to keep BQ busy for nobody.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      router.refresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  function refresh() {
    setSelectedIds(new Set());
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <ActionBar selectedRows={selectedRows} onActionComplete={refresh} actorEmail={actorEmail} />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Auto-refreshing every 5s · <FreshnessLabel lastRefreshed={lastRefreshed} />
        </span>
        <Button variant="ghost" size="sm" onClick={refresh}>
          <RefreshCw /> Refresh now
        </Button>
      </div>
      <OrdersTable data={data} selectedIds={selectedIds} onSelectionChange={setSelectedIds} />
    </div>
  );
}

function FreshnessLabel({ lastRefreshed }: { lastRefreshed: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const sec = Math.max(0, Math.floor((Date.now() - lastRefreshed) / 1000));
  return <span className="tabular-nums">updated {sec}s ago</span>;
}
