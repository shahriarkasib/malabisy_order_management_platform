/**
 * Server-only queries scoped to a vendor session.
 *
 * Every function in here MUST take the session's vendor list and filter by it
 * server-side. Never trust vendor names from request bodies or URL params.
 */

import { unstable_cache } from "next/cache";
import { getBigQuery } from "./client";

const PROJECT = process.env.GCP_PROJECT_ID || "malabisy-data";

function plainify<T>(rows: T[]): T[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      if (v && typeof v === "object" && "value" in (v as object)) {
        out[k] = (v as { value: unknown }).value;
      } else if (v && typeof v === "object" && typeof (v as { toNumber?: unknown }).toNumber === "function") {
        const n = (v as { toNumber: () => number }).toNumber();
        out[k] = Number.isFinite(n) ? n : (v as { toString: () => string }).toString();
      } else {
        out[k] = v;
      }
    }
    return out as T;
  });
}

export interface VendorProductRow {
  product_id: string;
  product_handle: string;
  product_title: string;
  product_status: string;
  product_type: string | null;
  variant_id: string;
  variant_title: string | null;
  sku: string | null;
  inventory_item_id: string | null;
  price: number | null;
  compare_at_price: number | null;
  cost: number | null;
  inventory_quantity: number | null;
  image_src: string | null;
  // overlay metadata: present if the vendor has a pending edit not yet
  // reflected in the underlying Shopify-backed table
  cost_pending: number | null;
  price_pending: number | null;
  inventory_pending: number | null;
}

/**
 * Fetch products + variants + overlaid pending edits, scoped to the given vendor list.
 *
 * The LEFT JOINs against ops.vendor_edits provide instant read-after-write:
 * if a vendor edited cost 30s ago, the override appears here even though the
 * 6h Shopify sync hasn't caught up yet. Once the sync catches up, an
 * external job marks the override as `superseded_at` and the COALESCE no
 * longer applies.
 */
export async function fetchVendorProducts(vendors: string[], opts: { limit?: number; search?: string } = {}): Promise<VendorProductRow[]> {
  if (vendors.length === 0) return [];
  const bq = getBigQuery();
  const limit = opts.limit ?? 500;
  const search = opts.search ?? "";

  const sql = `
    WITH cost_overlay AS (
      SELECT inventory_item_id,
             ARRAY_AGG(STRUCT(new_value, edited_at) ORDER BY edited_at DESC LIMIT 1)[OFFSET(0)] AS latest
      FROM \`${PROJECT}.ops.vendor_edits\`
      WHERE field = "cost" AND superseded_at IS NULL AND inventory_item_id IS NOT NULL
      GROUP BY inventory_item_id
    ),
    price_overlay AS (
      SELECT variant_id,
             ARRAY_AGG(STRUCT(new_value, edited_at) ORDER BY edited_at DESC LIMIT 1)[OFFSET(0)] AS latest
      FROM \`${PROJECT}.ops.vendor_edits\`
      WHERE field = "price" AND superseded_at IS NULL AND variant_id IS NOT NULL
      GROUP BY variant_id
    ),
    inv_overlay AS (
      SELECT inventory_item_id,
             ARRAY_AGG(STRUCT(new_value, edited_at) ORDER BY edited_at DESC LIMIT 1)[OFFSET(0)] AS latest
      FROM \`${PROJECT}.ops.vendor_edits\`
      WHERE field = "inventory_quantity" AND superseded_at IS NULL AND inventory_item_id IS NOT NULL
      GROUP BY inventory_item_id
    ),
    -- One inventory row per (item, location). We sum across locations to get
    -- a "total available" view for the vendor; future feature: per-location.
    inv_levels AS (
      SELECT inventory_item_id, SUM(available) AS available_total
      FROM \`${PROJECT}.shopify.inventory_levels\`
      GROUP BY inventory_item_id
    ),
    inv_costs AS (
      -- inventory_items.cost is NUMERIC stored as STRING in Shopify; cast safely.
      SELECT id AS inventory_item_id, SAFE_CAST(cost AS NUMERIC) AS cost
      FROM \`${PROJECT}.shopify.inventory_items\`
    )
    SELECT
      CAST(p.id AS STRING)            AS product_id,
      p.handle                         AS product_handle,
      p.title                          AS product_title,
      p.status                         AS product_status,
      p.product_type,
      CAST(v.id AS STRING)            AS variant_id,
      v.title                          AS variant_title,
      v.sku,
      CAST(v.inventory_item_id AS STRING) AS inventory_item_id,
      CAST(v.price AS FLOAT64)         AS price,
      SAFE_CAST(v.compare_at_price AS FLOAT64) AS compare_at_price,
      CAST(ic.cost AS FLOAT64)         AS cost,
      il.available_total               AS inventory_quantity,
      v.image_src                      AS image_src,
      SAFE_CAST(co.latest.new_value AS FLOAT64) AS cost_pending,
      SAFE_CAST(po.latest.new_value AS FLOAT64) AS price_pending,
      SAFE_CAST(io.latest.new_value AS INT64)   AS inventory_pending
    FROM \`${PROJECT}.shopify.products\` p
    INNER JOIN \`${PROJECT}.shopify.product_variants\` v ON v.product_id = p.id
    LEFT JOIN inv_levels il ON il.inventory_item_id = v.inventory_item_id
    LEFT JOIN inv_costs ic ON ic.inventory_item_id = v.inventory_item_id
    LEFT JOIN cost_overlay co ON co.inventory_item_id = v.inventory_item_id
    LEFT JOIN price_overlay po ON po.variant_id = v.id
    LEFT JOIN inv_overlay io ON io.inventory_item_id = v.inventory_item_id
    WHERE p.vendor IN UNNEST(@vendors)
      AND (
        @search = ""
        OR LOWER(p.title) LIKE CONCAT('%', LOWER(@search), '%')
        OR LOWER(IFNULL(v.sku, "")) LIKE CONCAT('%', LOWER(@search), '%')
        OR LOWER(p.handle) LIKE CONCAT('%', LOWER(@search), '%')
      )
    ORDER BY p.title, v.position
    LIMIT @limit
  `;

  const [rows] = await bq.query({
    query: sql,
    params: { vendors, search, limit },
    types: { vendors: ["STRING"], search: "STRING", limit: "INT64" },
  });
  return plainify(rows as VendorProductRow[]);
}

export const fetchVendorSummary = unstable_cache(
  async (vendors: string[]): Promise<{ total_products: number; active_products: number; total_orders_30d: number; revenue_30d: number }> => {
    if (vendors.length === 0) return { total_products: 0, active_products: 0, total_orders_30d: 0, revenue_30d: 0 };
    const bq = getBigQuery();
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM \`${PROJECT}.shopify.products\` WHERE vendor IN UNNEST(@vendors)) AS total_products,
        (SELECT COUNT(*) FROM \`${PROJECT}.shopify.products\` WHERE vendor IN UNNEST(@vendors) AND status = "ACTIVE") AS active_products,
        (SELECT COUNT(DISTINCT order_id) FROM \`${PROJECT}.gold.line_item_pipeline\`
           WHERE vendor IN UNNEST(@vendors) AND order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)) AS total_orders_30d,
        (SELECT SUM(net_line_total) FROM \`${PROJECT}.gold.line_item_pipeline\`
           WHERE vendor IN UNNEST(@vendors) AND order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)) AS revenue_30d
    `;
    const [rows] = await bq.query({ query: sql, params: { vendors }, types: { vendors: ["STRING"] } });
    return plainify(rows)[0] as Awaited<ReturnType<typeof fetchVendorSummary>>;
  },
  ["vendor-summary-v1"],
  { revalidate: 60, tags: ["vendor-summary"] },
);
