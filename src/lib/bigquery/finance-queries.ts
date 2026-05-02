/**
 * Cashflow / courier-money queries for the admin /finance page.
 *
 * Two couriers, two fields each:
 *   - "Already received" — money Malabisy's bank has actually got
 *   - "Pending"          — delivered to customer, not yet cashed out
 *
 * Bosta is the easy case: cash_cycle_cod + next_cashout_date are authoritative.
 * Logestechs doesn't expose a cashout date, so we approximate using delivery age.
 */

import { getBigQuery } from "./client";
import type { FinanceFilter } from "./finance-detail-queries";

const PROJECT = process.env.GCP_PROJECT_ID || "malabisy-data";

/**
 * Translate a FinanceFilter into the SQL fragments each section needs:
 *   - bosta date: comparison against bosta.deliveries_detail.updated_at
 *   - log date:   comparison against COALESCE(delivery_date, _synced_at)
 *   - vendor:     EXISTS subquery against gold.line_item_pipeline
 *
 * If startDate/endDate are blank we fall back to last 30 days so cards never
 * show "all time" by accident on first load.
 */
function clauses(filter: FinanceFilter | undefined) {
  const start = filter?.startDate;
  const end = filter?.endDate;
  const courier = filter?.courier ?? "All";
  const vendor = filter?.vendor;

  const bostaDate = [
    start ? `AND DATE(updated_at) >= '${start}'` : `AND DATE(updated_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)`,
    end   ? `AND DATE(updated_at) <= '${end}'`   : "",
  ].join("\n        ");
  const logDate = [
    start ? `AND DATE(COALESCE(delivery_date, _synced_at)) >= '${start}'` : `AND DATE(COALESCE(delivery_date, _synced_at)) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)`,
    end   ? `AND DATE(COALESCE(delivery_date, _synced_at)) <= '${end}'`   : "",
  ].join("\n        ");

  // Vendor filter narrows to deliveries containing at least one line item from
  // that vendor. Same logic as the Orders tab.
  const vendorClauseBosta = vendor
    ? `AND EXISTS (SELECT 1 FROM \`${PROJECT}.gold.line_item_pipeline\` g
                   WHERE g.tracking_number = bd.tracking_number AND g.vendor = '${vendor.replace(/'/g, "''")}')`
    : "";
  const vendorClauseLog = vendor
    ? `AND EXISTS (SELECT 1 FROM \`${PROJECT}.gold.line_item_pipeline\` g
                   WHERE g.tracking_number = ld.barcode AND g.vendor = '${vendor.replace(/'/g, "''")}')`
    : "";

  return {
    wantBosta: courier === "All" || courier === "Bosta",
    wantLogestechs: courier === "All" || courier === "Logestechs",
    bostaDate,
    logDate,
    vendorClauseBosta,
    vendorClauseLog,
  };
}

// Pull from env so finance can adjust without redeploy. Default tracks April 2026.
const EGP_PER_USD = Number(process.env.EGP_USD_RATE || 49);
const LOGESTECHS_PAYOUT_LAG_DAYS = 14; // assumption: settlement ~2 weeks after delivery

export interface CashflowSummary {
  bosta_received_egp: number;
  bosta_pending_egp: number;
  bosta_fees_30d_egp: number;
  bosta_gross_30d_egp: number;
  logestechs_received_egp: number;
  logestechs_pending_egp: number;
  logestechs_fees_30d_egp: number;
  logestechs_gross_30d_egp: number;
  total_received_egp: number;
  total_pending_egp: number;
  egp_per_usd: number;
}

export async function fetchCashflowSummary(filter?: FinanceFilter): Promise<CashflowSummary> {
  const bq = getBigQuery();
  const c = clauses(filter);

  // Each branch returns a single row of (received, pending, gross, fees).
  // When a courier is filtered out we substitute a constant-zero stub so the
  // CROSS JOIN below still yields one combined row.
  const bostaCte = c.wantBosta ? `
    SELECT
      SUM(IF(next_cashout_date < CURRENT_TIMESTAMP(),
             cash_cycle_cod
             - IFNULL(cash_cycle_bosta_fees,0) - IFNULL(cash_cycle_shipping_fees,0)
             - IFNULL(cash_cycle_collection_fees,0) - IFNULL(cash_cycle_cod_fees,0)
             - IFNULL(cash_cycle_insurance_fees,0) - IFNULL(cash_cycle_expedite_fees,0)
             - IFNULL(cash_cycle_vat,0) - IFNULL(cash_cycle_opening_package_fees,0)
             - IFNULL(cash_cycle_flex_ship_fees,0) - IFNULL(cash_cycle_fulfillment_fees,0),
             0)) AS received,
      SUM(IF(next_cashout_date >= CURRENT_TIMESTAMP() OR next_cashout_date IS NULL,
             IFNULL(cash_cycle_cod,0) - IFNULL(cash_cycle_bosta_fees,0)
             - IFNULL(cash_cycle_shipping_fees,0) - IFNULL(cash_cycle_collection_fees,0)
             - IFNULL(cash_cycle_cod_fees,0) - IFNULL(cash_cycle_insurance_fees,0)
             - IFNULL(cash_cycle_expedite_fees,0) - IFNULL(cash_cycle_vat,0)
             - IFNULL(cash_cycle_opening_package_fees,0) - IFNULL(cash_cycle_flex_ship_fees,0)
             - IFNULL(cash_cycle_fulfillment_fees,0),
             0)) AS pending,
      SUM(IFNULL(cash_cycle_cod,0)) AS gross,
      SUM(IFNULL(cash_cycle_bosta_fees,0) + IFNULL(cash_cycle_shipping_fees,0)
        + IFNULL(cash_cycle_collection_fees,0) + IFNULL(cash_cycle_cod_fees,0)
        + IFNULL(cash_cycle_insurance_fees,0) + IFNULL(cash_cycle_expedite_fees,0)
        + IFNULL(cash_cycle_vat,0) + IFNULL(cash_cycle_opening_package_fees,0)
        + IFNULL(cash_cycle_flex_ship_fees,0) + IFNULL(cash_cycle_fulfillment_fees,0)) AS fees
    FROM \`${PROJECT}.bosta.deliveries_detail\` bd
    WHERE state_code = 45
      ${c.bostaDate}
      ${c.vendorClauseBosta}
  ` : `SELECT 0.0 AS received, 0.0 AS pending, 0.0 AS gross, 0.0 AS fees`;

  const logCte = c.wantLogestechs ? `
    SELECT
      SUM(IF(delivery_date < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${LOGESTECHS_PAYOUT_LAG_DAYS} DAY),
             IFNULL(net_cod, 0), 0))                  AS received,
      SUM(IF(delivery_date >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${LOGESTECHS_PAYOUT_LAG_DAYS} DAY),
             IFNULL(net_cod, 0), 0))                  AS pending,
      SUM(IFNULL(cod, 0))                             AS gross,
      SUM(IFNULL(cod, 0) - IFNULL(net_cod, 0))        AS fees
    FROM \`${PROJECT}.bronze.logestechs_deliveries\` ld
    WHERE status = 'DELIVERED_TO_RECIPIENT'
      ${c.logDate}
      ${c.vendorClauseLog}
  ` : `SELECT 0.0 AS received, 0.0 AS pending, 0.0 AS gross, 0.0 AS fees`;

  const sql = `
    WITH bosta_branch AS (${bostaCte}),
         log_branch   AS (${logCte})
    SELECT
      IFNULL(b.received, 0) AS bosta_received,
      IFNULL(b.pending, 0)  AS bosta_pending,
      IFNULL(b.gross, 0)    AS bosta_gross,
      IFNULL(b.fees, 0)     AS bosta_fees,
      IFNULL(l.received, 0) AS logestechs_received,
      IFNULL(l.pending, 0)  AS logestechs_pending,
      IFNULL(l.gross, 0)    AS logestechs_gross,
      IFNULL(l.fees, 0)     AS logestechs_fees
    FROM bosta_branch b CROSS JOIN log_branch l
  `;
  const [rows] = await bq.query({ query: sql });
  const r = (rows[0] || {}) as Record<string, unknown>;
  const num = (k: string) => Number(r[k] ?? 0);
  return {
    bosta_received_egp:        num("bosta_received"),
    bosta_pending_egp:         num("bosta_pending"),
    bosta_fees_30d_egp:        num("bosta_fees"),
    bosta_gross_30d_egp:       num("bosta_gross"),
    logestechs_received_egp:   num("logestechs_received"),
    logestechs_pending_egp:    num("logestechs_pending"),
    logestechs_fees_30d_egp:   num("logestechs_fees"),
    logestechs_gross_30d_egp:  num("logestechs_gross"),
    total_received_egp:        num("bosta_received") + num("logestechs_received"),
    total_pending_egp:         num("bosta_pending") + num("logestechs_pending"),
    egp_per_usd:               EGP_PER_USD,
  };
}

export interface MonthlyCashflowRow {
  month: string;          // YYYY-MM
  bosta_net: number;
  logestechs_net: number;
  total_net_egp: number;
  total_net_usd: number;
}

export async function fetchMonthlyCashflow(months = 12, filter?: FinanceFilter): Promise<MonthlyCashflowRow[]> {
  const bq = getBigQuery();
  const c = clauses(filter);

  // When the filter narrows below 12 months we still want to show whatever's in
  // the active window. But when no date filter is set, force at least N months
  // so the chart isn't empty on first paint.
  const monthsClauseBosta = filter?.startDate
    ? "" // filter date already enforced by clauses()
    : `AND DATE(updated_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${months} MONTH)`;
  const monthsClauseLog = filter?.startDate
    ? ""
    : `AND DATE(COALESCE(delivery_date, _synced_at)) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${months} MONTH)`;

  const bostaCte = c.wantBosta ? `
    SELECT
      FORMAT_DATE('%Y-%m', DATE(updated_at)) AS month,
      SUM(IFNULL(cash_cycle_cod, 0)
        - IFNULL(cash_cycle_bosta_fees,0) - IFNULL(cash_cycle_shipping_fees,0)
        - IFNULL(cash_cycle_collection_fees,0) - IFNULL(cash_cycle_cod_fees,0)
        - IFNULL(cash_cycle_insurance_fees,0) - IFNULL(cash_cycle_expedite_fees,0)
        - IFNULL(cash_cycle_vat,0) - IFNULL(cash_cycle_opening_package_fees,0)
        - IFNULL(cash_cycle_flex_ship_fees,0) - IFNULL(cash_cycle_fulfillment_fees,0)) AS bosta_net
    FROM \`${PROJECT}.bosta.deliveries_detail\` bd
    WHERE state_code = 45
      ${c.bostaDate}
      ${monthsClauseBosta}
      ${c.vendorClauseBosta}
    GROUP BY month
  ` : `SELECT month, bosta_net FROM UNNEST(ARRAY<STRUCT<month STRING, bosta_net FLOAT64>>[])`;

  const logCte = c.wantLogestechs ? `
    SELECT
      FORMAT_DATE('%Y-%m', DATE(COALESCE(delivery_date, _synced_at))) AS month,
      SUM(IFNULL(net_cod, 0)) AS logestechs_net
    FROM \`${PROJECT}.bronze.logestechs_deliveries\` ld
    WHERE status = 'DELIVERED_TO_RECIPIENT'
      ${c.logDate}
      ${monthsClauseLog}
      ${c.vendorClauseLog}
    GROUP BY month
  ` : `SELECT month, logestechs_net FROM UNNEST(ARRAY<STRUCT<month STRING, logestechs_net FLOAT64>>[])`;

  const sql = `
    WITH bosta AS (${bostaCte}),
         logestechs AS (${logCte})
    SELECT
      m.month,
      IFNULL(b.bosta_net, 0)        AS bosta_net,
      IFNULL(l.logestechs_net, 0)   AS logestechs_net,
      IFNULL(b.bosta_net, 0) + IFNULL(l.logestechs_net, 0) AS total_net_egp
    FROM (
      SELECT month FROM bosta UNION DISTINCT SELECT month FROM logestechs
    ) m
    LEFT JOIN bosta b      USING (month)
    LEFT JOIN logestechs l USING (month)
    ORDER BY month DESC
  `;
  const [rows] = await bq.query({ query: sql });
  return (rows as Array<Record<string, unknown>>).map((r) => {
    const egp = Number(r.total_net_egp ?? 0);
    return {
      month: String(r.month),
      bosta_net: Number(r.bosta_net ?? 0),
      logestechs_net: Number(r.logestechs_net ?? 0),
      total_net_egp: egp,
      total_net_usd: egp / EGP_PER_USD,
    };
  });
}

export interface UpcomingCashout {
  cashout_date: string;
  parcels: number;
  expected_net_egp: number;
}

/**
 * Bosta tells us next_cashout_date per parcel — group by date so admins know
 * how much money is hitting the bank on each upcoming day.
 */
export async function fetchUpcomingCashouts(daysAhead = 21, filter?: FinanceFilter): Promise<UpcomingCashout[]> {
  const bq = getBigQuery();
  // Vendor filter applies; date filter does NOT (this is intentionally future-only).
  const vendorFilter = filter?.vendor
    ? `AND EXISTS (SELECT 1 FROM \`${PROJECT}.gold.line_item_pipeline\` g
                   WHERE g.tracking_number = bd.tracking_number AND g.vendor = '${filter.vendor.replace(/'/g, "''")}')`
    : "";
  // Hide Bosta entirely if courier filter is set to Logestechs.
  if (filter?.courier === "Logestechs") return [];

  const sql = `
    SELECT
      DATE(next_cashout_date) AS cashout_date,
      COUNT(*) AS parcels,
      ROUND(SUM(IFNULL(cash_cycle_cod, 0)
        - IFNULL(cash_cycle_bosta_fees,0) - IFNULL(cash_cycle_shipping_fees,0)
        - IFNULL(cash_cycle_collection_fees,0) - IFNULL(cash_cycle_cod_fees,0)
        - IFNULL(cash_cycle_insurance_fees,0) - IFNULL(cash_cycle_expedite_fees,0)
        - IFNULL(cash_cycle_vat,0) - IFNULL(cash_cycle_opening_package_fees,0)
        - IFNULL(cash_cycle_flex_ship_fees,0) - IFNULL(cash_cycle_fulfillment_fees,0)), 2) AS expected_net_egp
    FROM \`${PROJECT}.bosta.deliveries_detail\` bd
    WHERE state_code = 45
      AND next_cashout_date IS NOT NULL
      AND next_cashout_date >= CURRENT_TIMESTAMP()
      AND next_cashout_date < TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
      ${vendorFilter}
    GROUP BY cashout_date
    ORDER BY cashout_date ASC
  `;
  const [rows] = await bq.query({
    query: sql,
    params: { days: daysAhead },
    types: { days: "INT64" },
  });
  return (rows as Array<Record<string, unknown>>).map((r) => {
    const dateRaw = r.cashout_date && typeof r.cashout_date === "object" && "value" in r.cashout_date
      ? String((r.cashout_date as { value: string }).value)
      : String(r.cashout_date ?? "");
    return {
      cashout_date: dateRaw,
      parcels: Number(r.parcels ?? 0),
      expected_net_egp: Number(r.expected_net_egp ?? 0),
    };
  });
}
