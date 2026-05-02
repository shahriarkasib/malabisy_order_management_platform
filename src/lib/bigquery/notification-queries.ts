/**
 * Notification feed for the admin header bell. Surfaces failed / partial
 * actions across both audit streams so ops doesn't have to babysit the
 * audit log to know something broke.
 */

import { getBigQuery } from "./client";

const PROJECT = process.env.GCP_PROJECT_ID || "malabisy-data";

export interface NotificationItem {
  id: string;
  source: "ops" | "vendor";
  occurred_at: string;
  actor_email: string | null;
  title: string;       // short summary (e.g., "cancel_order failed")
  detail: string;      // longer line (order #, error, etc.)
  severity: "error" | "warning";
}

/**
 * Latest N failed/partial events from button_audit + vendor_edits.
 *
 * "Failure" definitions:
 *   - button_audit: final_status NOT IN ('success') OR shopify_status >= 400
 *                   OR error_message IS NOT NULL
 *   - vendor_edits: final_status != 'success'
 *
 * We bias toward LIVE failures (dry_run = false) for ops actions, but include
 * partials regardless because partials are the most insidious (some orders
 * succeeded, others didn't — the audit row reads "success" without context).
 */
export async function fetchRecentFailures(opts: { limit?: number; days?: number } = {}): Promise<NotificationItem[]> {
  const bq = getBigQuery();
  const limit = opts.limit ?? 50;
  const days = opts.days ?? 7;

  const sql = `
    WITH ops_failures AS (
      SELECT
        event_id AS id,
        'ops' AS source,
        clicked_at AS occurred_at,
        actor_email,
        action,
        final_status,
        shopify_order_name,
        shopify_status,
        error_message,
        dry_run
      FROM \`${PROJECT}.ops.button_audit\`
      WHERE clicked_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
        AND (
          final_status NOT IN ('success')
          OR (error_message IS NOT NULL AND error_message != '')
          OR (SAFE_CAST(shopify_status AS INT64) >= 400)
        )
    ),
    vendor_failures AS (
      SELECT
        edit_id AS id,
        'vendor' AS source,
        edited_at AS occurred_at,
        actor_email,
        vendor,
        field,
        final_status,
        new_value,
        shopify_status,
        error_message
      FROM \`${PROJECT}.ops.vendor_edits\`
      WHERE edited_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
        AND final_status != 'success'
    )
    SELECT 'ops' AS src, id, CAST(occurred_at AS STRING) AS occurred_at,
           actor_email, action AS k1, shopify_order_name AS k2,
           final_status, dry_run AS dry,
           shopify_status, error_message
    FROM ops_failures
    UNION ALL
    SELECT 'vendor' AS src, id, CAST(occurred_at AS STRING) AS occurred_at,
           actor_email, CONCAT(vendor, ' / ', field) AS k1, new_value AS k2,
           final_status, NULL AS dry,
           shopify_status, error_message
    FROM vendor_failures
    ORDER BY occurred_at DESC
    LIMIT @limit
  `;
  const [rows] = await bq.query({
    query: sql,
    params: { days, limit },
    types: { days: "INT64", limit: "INT64" },
  });

  return (rows as Array<Record<string, unknown>>).map((r) => {
    const finalStatus = r.final_status as string | null;
    const isPartial = finalStatus === "partial";
    const occurred =
      r.occurred_at && typeof r.occurred_at === "object" && "value" in r.occurred_at
        ? String((r.occurred_at as { value: string }).value)
        : String(r.occurred_at ?? "");

    if (r.src === "ops") {
      const action = r.k1 as string;
      const orderName = r.k2 as string | null;
      const dry = r.dry as boolean | null;
      const detailParts: string[] = [];
      if (orderName) detailParts.push(orderName);
      if (r.shopify_status) detailParts.push(`shopify:${r.shopify_status}`);
      if (dry) detailParts.push("dry-run");
      const errSnippet = (r.error_message as string | null)?.slice(0, 140) || "";
      if (errSnippet) detailParts.push(errSnippet);
      return {
        id: String(r.id),
        source: "ops",
        occurred_at: occurred,
        actor_email: (r.actor_email as string | null) || null,
        title: `${action} ${isPartial ? "partial" : (finalStatus || "failed")}`,
        detail: detailParts.join(" · ") || "(no detail)",
        severity: isPartial ? "warning" : "error",
      };
    }
    // vendor
    const k1 = r.k1 as string;
    const newValue = r.k2 as string | null;
    const detail = [newValue ? `new: ${newValue}` : null, (r.error_message as string | null)?.slice(0, 140) || null]
      .filter(Boolean)
      .join(" · ") || "(no detail)";
    return {
      id: String(r.id),
      source: "vendor",
      occurred_at: occurred,
      actor_email: (r.actor_email as string | null) || null,
      title: `${k1} edit failed`,
      detail,
      severity: "error",
    };
  });
}
