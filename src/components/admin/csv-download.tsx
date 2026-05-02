"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Generic CSV-from-array download. Server already shipped the rows; we just
 * convert in-browser to avoid a second round-trip for the same data.
 */
function toCsv(rows: Array<Record<string, unknown>>, columns: { key: string; header: string }[]): string {
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => escape(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => escape(row[c.key])).join(","));
  }
  return lines.join("\r\n");
}

export function CsvDownload<T extends Record<string, unknown>>({
  rows, filename, columns,
}: {
  rows: T[];
  filename: string;
  columns: { key: keyof T & string; header: string }[];
}) {
  function download() {
    const csv = toCsv(rows as Array<Record<string, unknown>>, columns);
    // BOM so Excel renders Arabic + special chars correctly.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" size="sm" onClick={download} disabled={rows.length === 0}>
      <Download className="size-4" /> Export CSV ({rows.length})
    </Button>
  );
}
