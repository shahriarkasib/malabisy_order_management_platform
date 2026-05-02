/**
 * Finance — granular queries for the /finance Orders + Vendors tabs.
 *
 * Two cross-courier views, both filtered by a common interface so the URL
 * (?period, ?vendor, ?courier) controls the whole page consistently.
 *
 * Vendor allocation (multi-vendor orders):
 *   When one Shopify order contains line items from multiple vendors, the
 *   courier's cash-cycle figures are at the order level, not the vendor level.
 *   We allocate proportionally: each vendor gets a slice of the COD/fees/net
 *   equal to their share of the order's line-item subtotal.
 */

import { getBigQuery } from "./client";

const PROJECT = process.env.GCP_PROJECT_ID || "malabisy-data";

export interface FinanceFilter {
  startDate?: string;   // ISO date 'YYYY-MM-DD'
  endDate?: string;     // ISO date 'YYYY-MM-DD'
  courier?: "Bosta" | "Logestechs" | "All";
  vendor?: string;
}

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

/**
 * Cross-courier deliveries view. One row per parcel that was delivered.
 *
 *   Bosta path:      cash_cycle_cod, cash_cycle_*_fees → net
 *   Logestechs path: cod, net_cod                      → net (next_cashout_date NULL)
 *
 * Both are joined to gold.line_item_pipeline by tracking_number to get the
 * vendor list per order. When an order has multiple vendors, vendor_list is
 * a comma-separated string so the table cell can show all of them.
 */
export interface OrderRow {
  delivery_id: string;
  courier: "Bosta" | "Logestechs";
  tracking_number: string | null;
  order_name: string | null;
  customer_name: string | null;
  state_value: string | null;
  cod: number;
  fees: number;
  net: number;
  next_cashout_date: string | null;
  delivered_at: string | null;
  vendors: string | null;     // comma-separated
}

function buildBaseUnion(filter: FinanceFilter): string {
  const courier = filter.courier ?? "All";
  const wantBosta = courier === "All" || courier === "Bosta";
  const wantLogestechs = courier === "All" || courier === "Logestechs";

  // Date filter applied to delivery completion timestamp.
  const bostaDateClause = filter.startDate
    ? `AND DATE(updated_at) >= '${filter.startDate}'` : "";
  const bostaEndClause = filter.endDate
    ? `AND DATE(updated_at) <= '${filter.endDate}'` : "";
  const logDateClause = filter.startDate
    ? `AND DATE(COALESCE(delivery_date, _synced_at)) >= '${filter.startDate}'` : "";
  const logEndClause = filter.endDate
    ? `AND DATE(COALESCE(delivery_date, _synced_at)) <= '${filter.endDate}'` : "";

  const parts: string[] = [];

  if (wantBosta) {
    parts.push(`
      SELECT
        _id                                               AS delivery_id,
        'Bosta'                                           AS courier,
        tracking_number,
        business_reference                                AS order_name,
        CONCAT(IFNULL(receiver_first_name,''), ' ', IFNULL(receiver_last_name,''))  AS customer_name,
        state_value,
        IFNULL(cash_cycle_cod, 0)                         AS cod,
        IFNULL(cash_cycle_bosta_fees,0) + IFNULL(cash_cycle_shipping_fees,0)
          + IFNULL(cash_cycle_collection_fees,0) + IFNULL(cash_cycle_cod_fees,0)
          + IFNULL(cash_cycle_insurance_fees,0) + IFNULL(cash_cycle_expedite_fees,0)
          + IFNULL(cash_cycle_vat,0) + IFNULL(cash_cycle_opening_package_fees,0)
          + IFNULL(cash_cycle_flex_ship_fees,0) + IFNULL(cash_cycle_fulfillment_fees,0) AS fees,
        IFNULL(cash_cycle_cod, 0)
          - IFNULL(cash_cycle_bosta_fees,0) - IFNULL(cash_cycle_shipping_fees,0)
          - IFNULL(cash_cycle_collection_fees,0) - IFNULL(cash_cycle_cod_fees,0)
          - IFNULL(cash_cycle_insurance_fees,0) - IFNULL(cash_cycle_expedite_fees,0)
          - IFNULL(cash_cycle_vat,0) - IFNULL(cash_cycle_opening_package_fees,0)
          - IFNULL(cash_cycle_flex_ship_fees,0) - IFNULL(cash_cycle_fulfillment_fees,0)  AS net,
        CAST(next_cashout_date AS STRING)                 AS next_cashout_date,
        CAST(updated_at AS STRING)                        AS delivered_at
      FROM \`${PROJECT}.bosta.deliveries_detail\`
      WHERE state_code = 45
        ${bostaDateClause}
        ${bostaEndClause}
    `);
  }

  if (wantLogestechs) {
    // Logestechs schema differs: shopify_order_number (INT) instead of
    // business_reference (STRING). Cast + format as "#NNNNN" so the Orders
    // tab cell looks consistent across both couriers.
    parts.push(`
      SELECT
        CAST(package_id AS STRING)                                                  AS delivery_id,
        'Logestechs'                                                                AS courier,
        barcode                                                                     AS tracking_number,
        IF(shopify_order_number IS NOT NULL,
           CONCAT('#', CAST(shopify_order_number AS STRING)), NULL)                AS order_name,
        NULLIF(TRIM(CONCAT(IFNULL(receiver_first_name,''), ' ', IFNULL(receiver_last_name,''))), '') AS customer_name,
        en_status                                                                   AS state_value,
        IFNULL(cod, 0)                                                              AS cod,
        IFNULL(cod, 0) - IFNULL(net_cod, 0)                                         AS fees,
        IFNULL(net_cod, 0)                                                          AS net,
        CAST(NULL AS STRING)                                                        AS next_cashout_date,
        CAST(COALESCE(delivery_date, _synced_at) AS STRING)                         AS delivered_at
      FROM \`${PROJECT}.bronze.logestechs_deliveries\`
      WHERE status = 'DELIVERED_TO_RECIPIENT'
        ${logDateClause}
        ${logEndClause}
    `);
  }

  return parts.join("\nUNION ALL\n");
}

/**
 * Per-order rows, joined to gold for the vendor list. Used by the Orders tab.
 */
export async function fetchFinanceOrders(filter: FinanceFilter, limit = 500): Promise<OrderRow[]> {
  const bq = getBigQuery();
  const base = buildBaseUnion(filter);
  if (!base) return [];

  // Vendor filter requires the JOIN to gold to expose any vendor name
  // overlap. We compute it as a STRING_AGG and filter the resulting list.
  const vendorClause = filter.vendor
    ? `WHERE STRPOS(IFNULL(vendors, ''), '${filter.vendor.replace(/'/g, "''")}') > 0`
    : "";

  const sql = `
    WITH base AS (
      ${base}
    ),
    -- Map tracking_number → comma-separated vendor list. One tracking_number
    -- can have several gold rows (multi-vendor order); we deduplicate vendors.
    vendor_lookup AS (
      SELECT
        tracking_number,
        STRING_AGG(DISTINCT vendor, ', ' ORDER BY vendor) AS vendors,
        ANY_VALUE(customer_name)                          AS customer_name_g
      FROM \`${PROJECT}.gold.line_item_pipeline\`
      WHERE tracking_number IS NOT NULL
      GROUP BY tracking_number
    )
    SELECT
      b.*,
      vl.vendors,
      COALESCE(NULLIF(TRIM(b.customer_name), ''), vl.customer_name_g) AS customer_name_resolved
    FROM base b
    LEFT JOIN vendor_lookup vl USING (tracking_number)
    ${vendorClause}
    ORDER BY b.delivered_at DESC
    LIMIT ${limit}
  `;

  const [rows] = await bq.query({ query: sql });
  return plainify(rows as Array<OrderRow & { customer_name_resolved: string | null }>).map((r) => ({
    delivery_id: r.delivery_id,
    courier: r.courier,
    tracking_number: r.tracking_number,
    order_name: r.order_name,
    customer_name: (r as { customer_name_resolved: string | null }).customer_name_resolved ?? r.customer_name,
    state_value: r.state_value,
    cod: Number(r.cod),
    fees: Number(r.fees),
    net: Number(r.net),
    next_cashout_date: r.next_cashout_date,
    delivered_at: r.delivered_at,
    vendors: r.vendors,
  }));
}

/**
 * Per-vendor rollup. Allocates each delivery's COD / fees / net to the
 * vendor(s) on that order proportionally by line-item subtotal.
 */
export interface VendorRow {
  vendor: string;
  orders: number;
  cod_share: number;
  fees_share: number;
  net_share: number;
  bosta_share: number;
  logestechs_share: number;
}

export async function fetchFinanceByVendor(filter: FinanceFilter): Promise<VendorRow[]> {
  const bq = getBigQuery();
  const base = buildBaseUnion(filter);
  if (!base) return [];

  // For each delivery we compute vendor weights from gold.line_item_pipeline.
  // weight_v = sum(net_line_total of vendor v) / sum(net_line_total all vendors).
  // Then allocate cod/fees/net by weight.
  const sql = `
    WITH delivery AS (
      ${base}
    ),
    vendor_weights AS (
      SELECT
        tracking_number,
        vendor,
        SUM(net_line_total) AS vendor_value,
        SUM(SUM(net_line_total)) OVER (PARTITION BY tracking_number) AS order_value
      FROM \`${PROJECT}.gold.line_item_pipeline\`
      WHERE tracking_number IS NOT NULL AND vendor IS NOT NULL
      GROUP BY tracking_number, vendor
    ),
    allocated AS (
      SELECT
        vw.vendor,
        d.tracking_number,
        d.courier,
        SAFE_DIVIDE(vw.vendor_value, vw.order_value) AS weight,
        d.cod  * SAFE_DIVIDE(vw.vendor_value, vw.order_value) AS vendor_cod,
        d.fees * SAFE_DIVIDE(vw.vendor_value, vw.order_value) AS vendor_fees,
        d.net  * SAFE_DIVIDE(vw.vendor_value, vw.order_value) AS vendor_net
      FROM delivery d
      JOIN vendor_weights vw USING (tracking_number)
    )
    SELECT
      vendor,
      COUNT(DISTINCT tracking_number)                                     AS orders,
      ROUND(SUM(IFNULL(vendor_cod, 0)), 2)                                AS cod_share,
      ROUND(SUM(IFNULL(vendor_fees, 0)), 2)                               AS fees_share,
      ROUND(SUM(IFNULL(vendor_net, 0)), 2)                                AS net_share,
      ROUND(SUM(IF(courier='Bosta',      IFNULL(vendor_net,0), 0)), 2)    AS bosta_share,
      ROUND(SUM(IF(courier='Logestechs', IFNULL(vendor_net,0), 0)), 2)    AS logestechs_share
    FROM allocated
    ${filter.vendor ? `WHERE vendor = '${filter.vendor.replace(/'/g, "''")}'` : ""}
    GROUP BY vendor
    ORDER BY net_share DESC
  `;
  const [rows] = await bq.query({ query: sql });
  return (rows as Array<Record<string, unknown>>).map((r) => ({
    vendor: String(r.vendor),
    orders: Number(r.orders ?? 0),
    cod_share: Number(r.cod_share ?? 0),
    fees_share: Number(r.fees_share ?? 0),
    net_share: Number(r.net_share ?? 0),
    bosta_share: Number(r.bosta_share ?? 0),
    logestechs_share: Number(r.logestechs_share ?? 0),
  }));
}

/**
 * Daily rollup for the timeline chart on the Overview tab.
 * Net only (the chart is "what landed in our bank that day").
 */
export interface DailyPoint { date: string; bosta: number; logestechs: number; total: number; }

export async function fetchDailyNet(filter: FinanceFilter): Promise<DailyPoint[]> {
  const bq = getBigQuery();
  const base = buildBaseUnion(filter);
  if (!base) return [];

  const sql = `
    WITH d AS (${base})
    SELECT
      DATE(delivered_at) AS day,
      SUM(IF(courier='Bosta',      net, 0)) AS bosta,
      SUM(IF(courier='Logestechs', net, 0)) AS logestechs,
      SUM(net)                              AS total
    FROM d
    WHERE delivered_at IS NOT NULL
    GROUP BY day
    ORDER BY day
  `;
  const [rows] = await bq.query({ query: sql });
  return (rows as Array<Record<string, unknown>>).map((r) => {
    const day = r.day && typeof r.day === "object" && "value" in r.day
      ? String((r.day as { value: string }).value)
      : String(r.day ?? "");
    return {
      date: day,
      bosta: Number(r.bosta ?? 0),
      logestechs: Number(r.logestechs ?? 0),
      total: Number(r.total ?? 0),
    };
  });
}
