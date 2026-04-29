import { unstable_cache } from "next/cache";
import { getBigQuery } from "./client";
import type { LineItem, AuditEntry, TabCount } from "@/types/order";
import type { PipelineTab, Direction } from "@/lib/constants";

const PROJECT = process.env.GCP_PROJECT_ID || "malabisy-data";

/**
 * BigQuery client returns class instances that Next.js can't pass from
 * Server → Client Components. Convert each cell to a primitive:
 *   - BigQueryDate / Timestamp / Datetime  → unwrap `.value` (string)
 *   - BigQueryNumeric / BigDecimal         → `.toNumber()` or `.toString()`
 *   - Big.js numbers                       → coerce to Number
 */
function flattenCell(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v !== "object") return v;
  const obj = v as Record<string, unknown>;

  // BigQueryDate / Timestamp / Datetime / Geography → { value: "..." }
  if ("value" in obj && typeof obj.value === "string") return obj.value;

  // BigQueryNumeric uses big.js → has toNumber()
  if (typeof (obj as { toNumber?: unknown }).toNumber === "function") {
    const n = (obj as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : (obj as { toString: () => string }).toString();
  }

  // big.js / bignumber.js shape: { s, e, c } — fall back to toString
  if ("s" in obj && "e" in obj && "c" in obj && typeof (obj as { toString?: unknown }).toString === "function") {
    return Number((obj as { toString: () => string }).toString());
  }

  return v;
}

function plainify<T>(rows: T[]): T[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      out[k] = flattenCell(v);
    }
    return out as T;
  });
}

export interface OrdersFilter {
  pipelineTab?: PipelineTab;
  direction?: Direction;
  search?: string;
  vendor?: string;
  paymentType?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

/**
 * Cache the rows query for 5s. Multiple polling clients with the same filter
 * combination will share a single BQ query per 5s window.
 *
 * After an action button fires, the route handler calls revalidatePath('/orders')
 * which busts this — see src/app/api/actions/[action]/route.ts.
 */
export async function fetchOrders(filter: OrdersFilter = {}): Promise<LineItem[]> {
  return _fetchOrdersCached(filter);
}

const _fetchOrdersCached = unstable_cache(
  async (filter: OrdersFilter): Promise<LineItem[]> => _fetchOrdersImpl(filter),
  ["orders-rows-v1"],
  { revalidate: 5, tags: ["orders"] },
);

async function _fetchOrdersImpl(filter: OrdersFilter): Promise<LineItem[]> {
  const bq = getBigQuery();
  const {
    pipelineTab = "All Orders",
    direction = "All",
    search = "",
    vendor,
    paymentType,
    startDate,
    endDate,
    limit = 500,
    offset = 0,
  } = filter;

  const sql = `
    SELECT
      CAST(order_id AS STRING) AS order_id,
      CAST(order_number AS STRING) AS order_number,
      DATE(order_date) AS order_date,
      created_at,
      CAST(line_item_id AS STRING) AS line_item_id,
      sku, product_title, variant_name, quantity,
      customer_name, customer_phone, customer_email,
      vendor, payment_type,
      bosta_id AS bosta_delivery_id,
      logestechs_id AS logestechs_shipment_id,
      tracking_number, tracking_company, courier_name,
      shipping_city, pickup_location,
      bosta_dropoff_city AS dropoff_city,
      bosta_state_value, bosta_type,
      display_status, pipeline_tab, direction,
      elapsed_days, elapsed_days_since_last_update,
      attempts_count, calls_number,
      item_price, net_line_total, commission,
      vendor_payout, total_fees, cod_amount,
      is_exception, needs_confirmation, is_confirmed,
      exception_reason, last_exception_code,
      return_reason
    FROM \`${PROJECT}.gold.line_item_pipeline_live\`
    WHERE 1=1
      ${startDate ? "AND order_date >= @startDate" : ""}
      ${endDate ? "AND order_date <= @endDate" : ""}
      AND (@pipelineTab = 'All Orders' OR pipeline_tab = @pipelineTab)
      AND (@direction = 'All' OR direction = @direction)
      ${vendor ? "AND vendor = @vendor" : ""}
      ${paymentType ? "AND payment_type = @paymentType" : ""}
      AND (
        @search = ''
        OR CAST(order_number AS STRING) LIKE CONCAT('%', @search, '%')
        OR LOWER(customer_name)   LIKE CONCAT('%', LOWER(@search), '%')
        OR LOWER(customer_phone)  LIKE CONCAT('%', LOWER(@search), '%')
        OR LOWER(tracking_number) LIKE CONCAT('%', LOWER(@search), '%')
        OR LOWER(sku)             LIKE CONCAT('%', LOWER(@search), '%')
      )
    ORDER BY order_date DESC, order_number DESC
    LIMIT @limit OFFSET @offset
  `;

  const [rows] = await bq.query({
    query: sql,
    params: {
      pipelineTab,
      direction,
      search,
      vendor: vendor ?? null,
      paymentType: paymentType ?? null,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      limit,
      offset,
    },
    types: {
      pipelineTab: "STRING",
      direction: "STRING",
      search: "STRING",
      vendor: "STRING",
      paymentType: "STRING",
      startDate: "DATE",
      endDate: "DATE",
      limit: "INT64",
      offset: "INT64",
    },
  });

  return plainify(rows as LineItem[]);
}

/**
 * Tab counts barely change between requests — cache for 60s so hopping between
 * pipeline tabs doesn't re-fetch the same aggregation 12 times in a minute.
 */
export const fetchTabCounts = unstable_cache(
  async (filter: OrdersFilter = {}): Promise<TabCount[]> => _fetchTabCounts(filter),
  ["tab-counts-v2"],
  { revalidate: 5, tags: ["orders"] },
);

async function _fetchTabCounts(filter: OrdersFilter = {}): Promise<TabCount[]> {
  const bq = getBigQuery();
  const { startDate, endDate, vendor, direction = "All" } = filter;

  // Read from the materialized view (auto-refreshing pre-aggregation).
  // Scan size: ~1 KB regardless of source table size.
  // Note: MV reads gold.line_item_pipeline only — ops.status_overrides aren't
  // reflected here. The action buttons update the badge optimistically client-side.
  const sql = `
    SELECT pipeline_tab, SUM(n) AS count
    FROM \`${PROJECT}.gold.mv_tab_counts\`
    WHERE 1=1
      ${startDate ? "AND order_date >= @startDate" : ""}
      ${endDate ? "AND order_date <= @endDate" : ""}
      ${vendor ? "AND vendor = @vendor" : ""}
      AND (@direction = 'All' OR direction = @direction)
    GROUP BY pipeline_tab
  `;

  const [rows] = await bq.query({
    query: sql,
    params: {
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      vendor: vendor ?? null,
      direction,
    },
    types: {
      startDate: "DATE",
      endDate: "DATE",
      vendor: "STRING",
      direction: "STRING",
    },
  });

  return (rows as Array<{ pipeline_tab: string; count: number }>).map((r) => ({
    pipeline_tab: r.pipeline_tab as PipelineTab,
    count: Number(r.count),
  }));
}

export async function fetchAuditLog(opts: { limit?: number; days?: number } = {}): Promise<AuditEntry[]> {
  const bq = getBigQuery();
  const { limit = 200, days = 7 } = opts;

  const sql = `
    SELECT
      event_id, clicked_at, actor_email, action,
      CAST(shopify_order_id AS STRING) AS shopify_order_id,
      shopify_order_name, tracking_number,
      CAST(bosta_delivery_id AS STRING) AS bosta_delivery_id,
      logestechs_shipment_id, courier, payload_json, dry_run,
      shopify_status, shopify_response, courier_status, courier_response,
      inventory_status, final_status, error_message, duration_ms
    FROM \`${PROJECT}.ops.button_audit\`
    WHERE clicked_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
    ORDER BY clicked_at DESC
    LIMIT @limit
  `;

  const [rows] = await bq.query({
    query: sql,
    params: { limit, days },
    types: { limit: "INT64", days: "INT64" },
  });

  return plainify(rows as AuditEntry[]);
}

/** Cache vendor list aggressively — they almost never change. */
export const fetchVendors = unstable_cache(
  async (): Promise<string[]> => {
    const bq = getBigQuery();
    const sql = `
      SELECT DISTINCT vendor
      FROM \`${PROJECT}.gold.line_item_pipeline_live\`
      WHERE vendor IS NOT NULL
      ORDER BY vendor
    `;
    const [rows] = await bq.query({ query: sql });
    return (rows as Array<{ vendor: string }>).map((r) => r.vendor);
  },
  ["vendors-v1"],
  { revalidate: 600, tags: ["vendors"] },
);
