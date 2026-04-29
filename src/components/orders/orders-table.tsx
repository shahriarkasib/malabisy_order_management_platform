"use client";

import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import type { LineItem } from "@/types/order";

interface Props {
  data: LineItem[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}

export function OrdersTable({ data, selectedIds, onSelectionChange }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<LineItem>[]>(
    () => [
      {
        id: "select",
        header: () => {
          const allSelected = data.length > 0 && data.every((d) => selectedIds.has(d.line_item_id));
          return (
            <input
              type="checkbox"
              aria-label="Select all"
              checked={allSelected}
              onChange={(e) => {
                if (e.target.checked) {
                  onSelectionChange(new Set(data.map((d) => d.line_item_id)));
                } else {
                  onSelectionChange(new Set());
                }
              }}
              className="size-4 rounded border-border"
            />
          );
        },
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label={`Select line item ${row.original.line_item_id}`}
            checked={selectedIds.has(row.original.line_item_id)}
            onChange={(e) => {
              const next = new Set(selectedIds);
              if (e.target.checked) next.add(row.original.line_item_id);
              else next.delete(row.original.line_item_id);
              onSelectionChange(next);
            }}
            className="size-4 rounded border-border"
          />
        ),
        size: 40,
        enableSorting: false,
      },
      {
        accessorKey: "order_number",
        header: "Order",
        cell: ({ row }) => <span className="font-medium">#{row.original.order_number}</span>,
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => formatDateTime(row.original.created_at ?? row.original.order_date),
      },
      { accessorKey: "line_item_id", header: "Line ID" },
      { accessorKey: "sku", header: "SKU" },
      { accessorKey: "vendor", header: "Vendor" },
      {
        accessorKey: "elapsed_days",
        header: "Days",
        cell: ({ row }) => row.original.elapsed_days ?? 0,
      },
      { accessorKey: "tracking_number", header: "Tracking" },
      {
        accessorKey: "bosta_state_value",
        header: "Bosta State",
        cell: ({ row }) =>
          row.original.bosta_state_value ? <Badge variant="info">{row.original.bosta_state_value}</Badge> : "—",
      },
      { accessorKey: "shipping_city", header: "City" },
      {
        accessorKey: "net_line_total",
        header: "Total",
        cell: ({ row }) => formatCurrency(row.original.net_line_total),
      },
      { accessorKey: "payment_type", header: "Payment" },
    ],
    [data, selectedIds, onSelectionChange],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-border">
              {hg.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-muted-foreground"
                    style={{ width: header.getSize() === 150 ? undefined : header.getSize() }}
                  >
                    <button
                      type="button"
                      disabled={!canSort}
                      onClick={header.column.getToggleSortingHandler()}
                      className={cn("inline-flex items-center gap-1", canSort && "hover:text-foreground")}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {canSort &&
                        (sorted === "asc" ? (
                          <ChevronUp className="size-3.5" />
                        ) : sorted === "desc" ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronsUpDown className="size-3.5 opacity-40" />
                        ))}
                    </button>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-12 text-center text-muted-foreground">
                No orders match the current filters.
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  "border-b border-border transition-colors hover:bg-accent/50",
                  selectedIds.has(row.original.line_item_id) && "bg-primary/5",
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="whitespace-nowrap px-3 py-2.5">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
