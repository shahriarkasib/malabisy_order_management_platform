"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RefreshButton({ source, label }: { source: "warehouse" | "shopify" | "bosta"; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function fire() {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const body = await r.json();
      if (!r.ok) {
        toast.error(body.error || `Failed to start ${label}`);
        return;
      }
      toast.success(body.message || `${label} started`);
      // Force a fresh server render after the trigger fires so any newly-stamped
      // freshness can show up — caller can also reload.
      setTimeout(() => router.refresh(), 1000);
    } catch (e) {
      toast.error("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" onClick={fire} disabled={busy}>
      <RefreshCw className={busy ? "animate-spin" : ""} />
      {busy ? "Starting…" : "Refresh now"}
    </Button>
  );
}
