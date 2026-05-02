/**
 * Period preset → date range resolver.
 *
 * Used by the orders page to translate `?period=this-month` into a
 * concrete startDate/endDate that BigQuery can filter on. Returns
 * `{ startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD" }` or `undefined` if
 * the period means "no date filter".
 *
 * All dates are returned in the calendar sense (no time component) and
 * should be applied as `WHERE order_date BETWEEN startDate AND endDate`.
 */

export type Period =
  | "all"
  | "today"
  | "yesterday"
  | "last-7"
  | "last-30"
  | "this-month"
  | "last-month"
  | "this-quarter"
  | "last-quarter"
  | "ytd"
  | "custom";

export interface DateRange {
  startDate: string;
  endDate: string;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function startOfQuarter(d: Date) {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}

function endOfQuarter(d: Date) {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3 + 3, 0);
}

export function resolvePeriod(
  period: string | undefined,
  customFrom?: string,
  customTo?: string,
  now: Date = new Date(),
): DateRange | undefined {
  switch (period) {
    case undefined:
    case "":
    case "all":
      return undefined;

    case "today": {
      const d = iso(now);
      return { startDate: d, endDate: d };
    }
    case "yesterday": {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      const d = iso(y);
      return { startDate: d, endDate: d };
    }
    case "last-7": {
      const start = new Date(now); start.setDate(start.getDate() - 6);
      return { startDate: iso(start), endDate: iso(now) };
    }
    case "last-30": {
      const start = new Date(now); start.setDate(start.getDate() - 29);
      return { startDate: iso(start), endDate: iso(now) };
    }
    case "this-month":
      return { startDate: iso(startOfMonth(now)), endDate: iso(now) };

    case "last-month": {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { startDate: iso(startOfMonth(lastMonth)), endDate: iso(endOfMonth(lastMonth)) };
    }
    case "this-quarter":
      return { startDate: iso(startOfQuarter(now)), endDate: iso(now) };

    case "last-quarter": {
      const lastQ = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      return { startDate: iso(startOfQuarter(lastQ)), endDate: iso(endOfQuarter(lastQ)) };
    }
    case "ytd":
      return { startDate: iso(new Date(now.getFullYear(), 0, 1)), endDate: iso(now) };

    case "custom": {
      if (!customFrom && !customTo) return undefined;
      return {
        startDate: customFrom || "1970-01-01",
        endDate: customTo || iso(now),
      };
    }
    default:
      return undefined;
  }
}
