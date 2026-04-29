"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OrdersTable } from "./orders-table";
import { ActionBar } from "./action-bar";
import type { LineItem } from "@/types/order";

interface Props {
  data: LineItem[];
  /** TODO: replace with auth claim once Clerk is wired in. */
  actorEmail: string;
}

export function OrdersPageClient({ data, actorEmail }: Props) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedRows = data.filter((d) => selectedIds.has(d.line_item_id));

  function refresh() {
    setSelectedIds(new Set());
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <ActionBar selectedRows={selectedRows} onActionComplete={refresh} actorEmail={actorEmail} />
      <OrdersTable data={data} selectedIds={selectedIds} onSelectionChange={setSelectedIds} />
    </div>
  );
}
