"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Save, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { VendorProductRow } from "@/lib/bigquery/vendor-queries";

type EditableField = "cost" | "price" | "inventory_quantity";

interface Props {
  rows: VendorProductRow[];
}

export function VendorProductsTable({ rows: initialRows }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [editing, setEditing] = useState<{ key: string; field: EditableField } | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);

  function rowKey(r: VendorProductRow) {
    return r.variant_id;
  }

  function effectiveValue(row: VendorProductRow, field: EditableField): number | null {
    if (field === "cost") return row.cost_pending ?? row.cost;
    if (field === "price") return row.price_pending ?? row.price;
    return row.inventory_pending ?? row.inventory_quantity;
  }

  function isPending(row: VendorProductRow, field: EditableField): boolean {
    if (field === "cost") return row.cost_pending !== null;
    if (field === "price") return row.price_pending !== null;
    return row.inventory_pending !== null;
  }

  function startEdit(row: VendorProductRow, field: EditableField) {
    setEditing({ key: rowKey(row), field });
    setDraft(String(effectiveValue(row, field) ?? ""));
  }

  function cancelEdit() {
    setEditing(null);
    setDraft("");
  }

  async function saveEdit(row: VendorProductRow, field: EditableField) {
    const newValue = draft.trim();
    if (!newValue) { toast.error("Value can't be empty"); return; }
    const numeric = Number(newValue);
    if (!Number.isFinite(numeric) || numeric < 0) { toast.error("Must be a non-negative number"); return; }

    setSaving(true);
    try {
      const r = await fetch("/api/vendor/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant_id: row.variant_id,
          inventory_item_id: row.inventory_item_id,
          product_id: row.product_id,
          field,
          new_value: numeric,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        toast.error(`Save failed: ${body.error || r.status}`);
        return;
      }
      // Optimistically update local state with the pending value.
      setRows((prev) =>
        prev.map((p) => {
          if (rowKey(p) !== rowKey(row)) return p;
          if (field === "cost") return { ...p, cost_pending: numeric };
          if (field === "price") return { ...p, price_pending: numeric };
          return { ...p, inventory_pending: Math.round(numeric) };
        }),
      );
      toast.success(`${field === "inventory_quantity" ? "Inventory" : field[0].toUpperCase() + field.slice(1)} saved`);
      setEditing(null);
      setDraft("");
    } catch (e) {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  function fmt(v: number | null, isInt = false): string {
    if (v === null || v === undefined) return "—";
    return isInt ? String(Math.round(v)) : v.toFixed(2);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/40">
          <tr className="text-left">
            <th className="px-4 py-3 font-medium">Product</th>
            <th className="px-4 py-3 font-medium">Variant</th>
            <th className="px-4 py-3 font-medium">SKU</th>
            <th className="px-4 py-3 text-right font-medium">Cost</th>
            <th className="px-4 py-3 text-right font-medium">Price</th>
            <th className="px-4 py-3 text-right font-medium">Inventory</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                No products found.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={rowKey(r)} className="border-b border-border last:border-b-0 hover:bg-accent/30">
              <td className="px-4 py-2">
                <div className="flex items-center gap-3">
                  {r.image_src ? (
                    <Image src={r.image_src} alt="" width={40} height={40} className="rounded object-cover" />
                  ) : (
                    <div className="size-10 rounded bg-muted" />
                  )}
                  <div>
                    <div className="font-medium leading-tight">{r.product_title}</div>
                    {r.product_type && <div className="text-xs text-muted-foreground">{r.product_type}</div>}
                  </div>
                </div>
              </td>
              <td className="px-4 py-2 text-muted-foreground">{r.variant_title || "—"}</td>
              <td className="px-4 py-2 font-mono text-xs">{r.sku || "—"}</td>

              {(["cost", "price", "inventory_quantity"] as EditableField[]).map((field) => {
                const isEditing = editing?.key === rowKey(r) && editing?.field === field;
                const isInt = field === "inventory_quantity";
                const pending = isPending(r, field);
                return (
                  <td key={field} className="px-4 py-2 text-right tabular-nums">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-1">
                        <Input
                          autoFocus
                          type="number"
                          step={isInt ? "1" : "0.01"}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(r, field);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          className="h-7 w-24 text-right tabular-nums"
                        />
                        <Button size="sm" variant="ghost" onClick={() => saveEdit(r, field)} disabled={saving}>
                          <Save className="size-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}>
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(r, field)}
                        className="-mx-2 rounded px-2 py-1 hover:bg-accent"
                        title="Click to edit"
                      >
                        {fmt(effectiveValue(r, field), isInt)}
                        {pending && (
                          <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-orange-500" title="Pending — Shopify sync catching up">
                            <RefreshCw className="size-2.5 animate-spin" />
                          </span>
                        )}
                      </button>
                    )}
                  </td>
                );
              })}

              <td className="px-4 py-2">
                <span
                  className={
                    r.product_status === "ACTIVE"
                      ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
                      : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                  }
                >
                  {r.product_status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
