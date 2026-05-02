/**
 * Admin settings page — query helpers for admin/system status.
 * Server-only. Caller must be requireInternal()'d.
 */

import { getBigQuery } from "./client";

const PROJECT = process.env.GCP_PROJECT_ID || "malabisy-data";

export interface AdminAccount {
  email: string;
  display_name: string | null;
  role: string;
  active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export async function fetchAdminAccounts(): Promise<AdminAccount[]> {
  const bq = getBigQuery();
  const [rows] = await bq.query({
    query: `
      SELECT email, display_name, role, active, created_at, last_login_at
      FROM \`${PROJECT}.ops.vendor_accounts\`
      WHERE role = 'internal'
      ORDER BY email
    `,
  });
  return rows.map((r: Record<string, unknown>) => ({
    email: String(r.email),
    display_name: r.display_name ? String(r.display_name) : null,
    role: String(r.role),
    active: Boolean(r.active),
    created_at: r.created_at && typeof r.created_at === "object" && "value" in r.created_at
      ? String((r.created_at as { value: string }).value)
      : String(r.created_at ?? ""),
    last_login_at: r.last_login_at && typeof r.last_login_at === "object" && "value" in r.last_login_at
      ? String((r.last_login_at as { value: string }).value)
      : (r.last_login_at ? String(r.last_login_at) : null),
  }));
}

export interface SystemStatus {
  shopify_realtime_orders: number;
  shopify_realtime_line_items: number;
  shopify_orders_count: number;
  bosta_deliveries_count: number;
  vendor_users_count: number;
  vendor_edits_30d: number;
  ops_actions_30d: number;
  last_warehouse_run_minutes_ago: number | null;
  last_bosta_sync_minutes_ago: number | null;
  last_shopify_webhook_minutes_ago: number | null;
}

export async function fetchSystemStatus(): Promise<SystemStatus> {
  const bq = getBigQuery();
  const [rows] = await bq.query({
    query: `
      SELECT
        (SELECT COUNT(*) FROM \`${PROJECT}.shopify_realtime.orders\`)                            AS shopify_realtime_orders,
        (SELECT COUNT(*) FROM \`${PROJECT}.shopify_realtime.order_line_items\`)                  AS shopify_realtime_line_items,
        (SELECT COUNT(*) FROM \`${PROJECT}.shopify.orders\`)                                     AS shopify_orders_count,
        (SELECT COUNT(*) FROM \`${PROJECT}.bosta.deliveries\`)                                   AS bosta_deliveries_count,
        (SELECT COUNT(DISTINCT email) FROM \`${PROJECT}.ops.vendor_user_access\`)                AS vendor_users_count,
        (SELECT COUNT(*) FROM \`${PROJECT}.ops.vendor_edits\`
           WHERE edited_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY))               AS vendor_edits_30d,
        (SELECT COUNT(*) FROM \`${PROJECT}.ops.button_audit\`
           WHERE clicked_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY))              AS ops_actions_30d,
        (SELECT TIMESTAMP_DIFF(CURRENT_TIMESTAMP(),
                               MAX(storage_last_modified_time), MINUTE)
           FROM \`${PROJECT}\`.\`region-us\`.INFORMATION_SCHEMA.TABLE_STORAGE
           WHERE table_schema = "gold" AND table_name = "line_item_pipeline")                    AS last_warehouse_run_minutes_ago,
        (SELECT TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(_synced_at), MINUTE)
           FROM \`${PROJECT}.bosta.deliveries\`)                                                 AS last_bosta_sync_minutes_ago,
        (SELECT TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(webhook_received_at), MINUTE)
           FROM \`${PROJECT}.shopify_realtime.orders\`)                                          AS last_shopify_webhook_minutes_ago
    `,
  });
  const r = rows[0] as Record<string, unknown>;
  const num = (k: string) => (r[k] === null || r[k] === undefined ? null : Number(r[k]));
  return {
    shopify_realtime_orders:        Number(r.shopify_realtime_orders ?? 0),
    shopify_realtime_line_items:    Number(r.shopify_realtime_line_items ?? 0),
    shopify_orders_count:           Number(r.shopify_orders_count ?? 0),
    bosta_deliveries_count:         Number(r.bosta_deliveries_count ?? 0),
    vendor_users_count:             Number(r.vendor_users_count ?? 0),
    vendor_edits_30d:               Number(r.vendor_edits_30d ?? 0),
    ops_actions_30d:                Number(r.ops_actions_30d ?? 0),
    last_warehouse_run_minutes_ago: num("last_warehouse_run_minutes_ago"),
    last_bosta_sync_minutes_ago:    num("last_bosta_sync_minutes_ago"),
    last_shopify_webhook_minutes_ago: num("last_shopify_webhook_minutes_ago"),
  };
}
