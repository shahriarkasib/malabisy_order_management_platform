/**
 * Admin-only BigQuery helpers — for managing vendor users + access.
 * Server-only. Every caller must be requireInternal()'d first.
 */

import { getBigQuery } from "./client";

const PROJECT = process.env.GCP_PROJECT_ID || "malabisy-data";

export interface VendorWithUsers {
  vendor: string;
  product_count: number;
  active_product_count: number;
  user_count: number;
  users: Array<{ email: string; display_name: string | null; granted_at: string | null }>;
  edits_total: number;
  edits_synced: number;     // ones whose superseded_at is set — Shopify caught up
  edits_pending: number;    // success but Shopify-side hasn't reflected yet
  edits_failed: number;
  last_edit_at: string | null;
}

/**
 * One row per Shopify vendor + the list of users who have access to it.
 * Joined to shopify.products so we know the product count, and to
 * ops.vendor_user_access (LEFT JOIN) so vendors with zero users still appear.
 */
export async function fetchVendorsWithUsers(): Promise<VendorWithUsers[]> {
  const bq = getBigQuery();
  const sql = `
    WITH vendor_stats AS (
      SELECT vendor, COUNT(*) AS product_count, COUNTIF(status = "ACTIVE") AS active_product_count
      FROM \`${PROJECT}.shopify.products\`
      WHERE vendor IS NOT NULL AND vendor != ""
      GROUP BY vendor
    ),
    vendor_users AS (
      SELECT
        va.vendor,
        ARRAY_AGG(STRUCT(
          a.email AS email,
          a.display_name AS display_name,
          CAST(va.granted_at AS STRING) AS granted_at
        ) ORDER BY a.email) AS users,
        COUNT(*) AS user_count
      FROM \`${PROJECT}.ops.vendor_user_access\` va
      JOIN \`${PROJECT}.ops.vendor_accounts\` a ON LOWER(a.email) = LOWER(va.email) AND a.active = TRUE
      GROUP BY va.vendor
    ),
    vendor_edit_stats AS (
      SELECT
        vendor,
        COUNT(*) AS edits_total,
        COUNTIF(superseded_at IS NOT NULL) AS edits_synced,
        COUNTIF(superseded_at IS NULL AND final_status = 'success') AS edits_pending,
        COUNTIF(final_status != 'success') AS edits_failed,
        CAST(MAX(edited_at) AS STRING) AS last_edit_at
      FROM \`${PROJECT}.ops.vendor_edits\`
      GROUP BY vendor
    )
    SELECT
      vs.vendor,
      vs.product_count,
      vs.active_product_count,
      IFNULL(vu.user_count, 0) AS user_count,
      IFNULL(vu.users, []) AS users,
      IFNULL(ve.edits_total, 0)   AS edits_total,
      IFNULL(ve.edits_synced, 0)  AS edits_synced,
      IFNULL(ve.edits_pending, 0) AS edits_pending,
      IFNULL(ve.edits_failed, 0)  AS edits_failed,
      ve.last_edit_at
    FROM vendor_stats vs
    LEFT JOIN vendor_users vu USING (vendor)
    LEFT JOIN vendor_edit_stats ve USING (vendor)
    ORDER BY vs.product_count DESC
  `;
  const [rows] = await bq.query({ query: sql });
  return rows.map((r: Record<string, unknown>) => ({
    ...r,
    user_count: Number(r.user_count),
    product_count: Number(r.product_count),
    active_product_count: Number(r.active_product_count),
    edits_total: Number(r.edits_total ?? 0),
    edits_synced: Number(r.edits_synced ?? 0),
    edits_pending: Number(r.edits_pending ?? 0),
    edits_failed: Number(r.edits_failed ?? 0),
    last_edit_at: r.last_edit_at && typeof r.last_edit_at === "object" && "value" in r.last_edit_at
      ? String((r.last_edit_at as { value: string }).value)
      : (r.last_edit_at ? String(r.last_edit_at) : null),
  })) as VendorWithUsers[];
}

/** Grant a user access to a vendor. Creates the user account if missing. */
export async function grantVendorAccess(args: {
  email: string;
  vendor: string;
  granted_by: string;
  display_name?: string;
}): Promise<{ status: "granted" | "already_had_access" | "user_created_and_granted" }> {
  const email = args.email.trim().toLowerCase();
  const bq = getBigQuery();

  // 1. Does the user already exist?
  const [existing] = await bq.query({
    query: `SELECT email, role FROM \`${PROJECT}.ops.vendor_accounts\` WHERE LOWER(email) = @email LIMIT 1`,
    params: { email },
    types: { email: "STRING" },
  });
  const userExists = (existing as Array<unknown>).length > 0;

  // 2. Already has this access?
  const [accessRows] = await bq.query({
    query: `SELECT 1 FROM \`${PROJECT}.ops.vendor_user_access\` WHERE LOWER(email) = @email AND vendor = @vendor LIMIT 1`,
    params: { email, vendor: args.vendor },
    types: { email: "STRING", vendor: "STRING" },
  });
  if ((accessRows as Array<unknown>).length > 0) {
    return { status: "already_had_access" };
  }

  // 3. Create user if missing.
  if (!userExists) {
    await bq.query({
      query: `
        INSERT INTO \`${PROJECT}.ops.vendor_accounts\` (email, role, display_name, active, created_at, invited_by)
        VALUES (@email, 'owner', @name, TRUE, CURRENT_TIMESTAMP(), @by)
      `,
      params: { email, name: args.display_name ?? args.email.split("@")[0], by: args.granted_by },
      types: { email: "STRING", name: "STRING", by: "STRING" },
    });
  }

  // 4. Grant access.
  await bq.query({
    query: `
      INSERT INTO \`${PROJECT}.ops.vendor_user_access\` (email, vendor, granted_at, granted_by)
      VALUES (@email, @vendor, CURRENT_TIMESTAMP(), @by)
    `,
    params: { email, vendor: args.vendor, by: args.granted_by },
    types: { email: "STRING", vendor: "STRING", by: "STRING" },
  });

  return { status: userExists ? "granted" : "user_created_and_granted" };
}

export async function revokeVendorAccess(email: string, vendor: string): Promise<{ removed: number }> {
  const bq = getBigQuery();
  const [job] = await bq.query({
    query: `DELETE FROM \`${PROJECT}.ops.vendor_user_access\` WHERE LOWER(email) = @email AND vendor = @vendor`,
    params: { email: email.toLowerCase(), vendor },
    types: { email: "STRING", vendor: "STRING" },
  });
  void job;
  // BQ doesn't easily return affected rows from a DELETE; treat success as 1.
  return { removed: 1 };
}

/** Distinct list of all Shopify vendors. Used by the "add user" dialog. */
export async function fetchAllVendorNames(): Promise<string[]> {
  const bq = getBigQuery();
  const [rows] = await bq.query({
    query: `
      SELECT DISTINCT vendor FROM \`${PROJECT}.shopify.products\`
      WHERE vendor IS NOT NULL AND vendor != ""
      ORDER BY vendor
    `,
  });
  return (rows as Array<{ vendor: string }>).map((r) => r.vendor);
}
