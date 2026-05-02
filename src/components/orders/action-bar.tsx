"use client";

import { useState, useTransition } from "react";
import {
  XCircle,
  Trash2,
  CheckCircle2,
  PackageX,
  PackagePlus,
  Truck,
  CircleSlash,
  ThumbsDown,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { LineItem } from "@/types/order";

interface Props {
  selectedRows: LineItem[];
  onActionComplete: () => void;
  actorEmail: string;
}

type ActionKey =
  | "cancel"
  | "removeItem"
  | "markDelivered"
  | "markLost"
  | "markCancelled"
  | "rejected"
  | "rejectedReturn"
  | "confirm"
  | "autoAwb"
  | "forceLogestechs";

export function ActionBar({ selectedRows, onActionComplete, actorEmail }: Props) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<ActionKey | null>(null);
  const count = selectedRows.length;

  if (count === 0) {
    return (
      <div className="flex h-12 items-center text-sm text-muted-foreground">
        Select line items to enable actions.
      </div>
    );
  }

  function run(key: ActionKey, fn: () => Promise<void>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(key);
    startTransition(async () => {
      try {
        await fn();
        onActionComplete();
      } finally {
        setBusy(null);
      }
    });
  }

  const orderIds = Array.from(new Set(selectedRows.map((r) => r.order_id)));
  const orderNames = Array.from(new Set(selectedRows.map((r) => r.order_number))).join(", ");

  async function callAction(action: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/actions/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `${action} failed`);
    return json;
  }

  async function bulkSetStatus(overrideStatus: string) {
    const failures: string[] = [];
    for (const row of selectedRows) {
      try {
        await callAction("set-status", {
          line_item_id: row.line_item_id,
          shopify_order_id: row.order_id,
          override_status: overrideStatus,
          actor_email: actorEmail,
        });
      } catch (e) {
        failures.push(`${row.order_number}/${row.sku}: ${(e as Error).message}`);
      }
    }
    if (failures.length === 0) {
      toast.success(`Marked ${count} item(s) as ${overrideStatus}`);
    } else {
      toast.warning(`Marked ${count - failures.length}/${count}`, { description: failures.join("\n") });
    }
  }

  async function bulkPerOrder(action: "cancel" | "confirm" | "auto-awb" | "force-logestechs") {
    const failures: string[] = [];
    for (const orderId of orderIds) {
      const row = selectedRows.find((r) => r.order_id === orderId)!;
      try {
        if (action === "cancel") {
          // Pass courier info so the CF terminates the AWB on Bosta/Logestechs.
          // Without this, the order cancels in Shopify but the package keeps
          // moving on the courier's side and gets delivered anyway (#36067 bug).
          const courier = row.bosta_delivery_id
            ? "Bosta"
            : row.logestechs_shipment_id
              ? "Logestechs"
              : null;
          await callAction("cancel-order", {
            shopify_order_id: orderId,
            actor_email: actorEmail,
            reason: "ops_cancel",
            courier,
            bosta_delivery_id: row.bosta_delivery_id,
            logestechs_shipment_id: row.logestechs_shipment_id,
            tracking_number: row.tracking_number,
          });
        } else if (action === "confirm") {
          await callAction("confirm-order", { shopify_order_id: orderId, actor_email: actorEmail });
        } else if (action === "auto-awb") {
          await callAction("auto-awb", { shopify_order_id: orderId, actor_email: actorEmail });
        } else if (action === "force-logestechs") {
          if (row.bosta_delivery_id) {
            await callAction("change-courier", {
              shopify_order_id: orderId,
              actor_email: actorEmail,
              current_courier: "Bosta",
              current_bosta_delivery_id: row.bosta_delivery_id,
              new_courier: "Logestechs",
            });
          } else if (!row.logestechs_shipment_id) {
            await callAction("auto-awb", {
              shopify_order_id: orderId,
              actor_email: actorEmail,
              courier_override: "Logestechs",
            });
          }
        }
      } catch (e) {
        failures.push(`${row.order_number}: ${(e as Error).message}`);
      }
    }
    const verb =
      action === "cancel"
        ? "Cancelled"
        : action === "confirm"
          ? "Confirmed"
          : action === "auto-awb"
            ? "Created AWB for"
            : "Switched courier for";
    if (failures.length === 0) {
      toast.success(`${verb} ${orderIds.length} order(s)`);
    } else {
      toast.warning(`${verb} ${orderIds.length - failures.length}/${orderIds.length}`, {
        description: failures.join("\n"),
      });
    }
  }

  async function bulkRemove() {
    const failures: string[] = [];
    for (const row of selectedRows) {
      try {
        await callAction("remove-item", {
          shopify_order_id: row.order_id,
          line_item_id: row.line_item_id,
          quantity: row.quantity || 1,
          actor_email: actorEmail,
        });
      } catch (e) {
        failures.push(`${row.order_number}/${row.sku}: ${(e as Error).message}`);
      }
    }
    if (failures.length === 0) toast.success(`Removed ${count} line item(s)`);
    else toast.warning(`Removed ${count - failures.length}/${count}`, { description: failures.join("\n") });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
      <span className="mr-2 text-sm font-medium">{count} selected</span>

      <Button
        variant="success"
        size="sm"
        disabled={pending}
        onClick={() => run("confirm", () => bulkPerOrder("confirm"))}
      >
        <CheckCircle2 /> Confirm
      </Button>

      <Button
        variant="default"
        size="sm"
        disabled={pending}
        onClick={() => run("markDelivered", () => bulkSetStatus("Delivered"))}
      >
        <Truck /> Mark Delivered
      </Button>

      <Button
        variant="warning"
        size="sm"
        disabled={pending}
        onClick={() => run("markLost", () => bulkSetStatus("Lost"))}
      >
        <PackageX /> Mark Lost
      </Button>

      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => run("markCancelled", () => bulkSetStatus("Cancelled"))}
      >
        <CircleSlash /> Mark Cancelled
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run("rejected", () => bulkSetStatus("Rejected"))}
      >
        <ThumbsDown /> Rejected
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run("rejectedReturn", () => bulkSetStatus("Rejected Return"))}
      >
        <RotateCcw /> Rejected Return
      </Button>

      <div className="mx-2 h-6 w-px bg-border" />

      <Button
        variant="default"
        size="sm"
        disabled={pending}
        onClick={() => run("autoAwb", () => bulkPerOrder("auto-awb"))}
      >
        <PackagePlus /> Auto AWB
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run("forceLogestechs", () => bulkPerOrder("force-logestechs"))}
      >
        <Truck /> Force Logestechs
      </Button>

      <div className="mx-2 h-6 w-px bg-border" />

      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() =>
          run(
            "removeItem",
            () => bulkRemove(),
            `Remove ${count} line item(s) from ${orderNames}? This refunds + restocks. Cannot be undone.`,
          )
        }
      >
        <Trash2 /> Remove Item
      </Button>

      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() =>
          run(
            "cancel",
            () => bulkPerOrder("cancel"),
            `Cancel ${orderIds.length} order(s): ${orderNames}? This refunds + restocks + terminates AWBs. Cannot be undone.`,
          )
        }
      >
        <XCircle /> Cancel Order
      </Button>

      {busy && <span className="ml-auto text-sm text-muted-foreground">Running…</span>}
    </div>
  );
}
