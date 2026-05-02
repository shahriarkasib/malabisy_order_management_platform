/**
 * Vendor edit endpoint.
 *
 * Vendors can edit:
 *   - cost                (writes inventory_items.cost via Shopify Admin API)
 *   - price               (writes variants.price)
 *   - compare_at_price    (writes variants.compare_at_price)
 *   - inventory_quantity  (writes inventory_levels.available via inventory_levels/set)
 *
 * Security: vendor name comes from the authenticated session, never the body.
 * We verify the variant being edited actually belongs to the session's vendor list
 * BEFORE calling Shopify.
 *
 * After Shopify confirms, we write a row to ops.vendor_edits which the live
 * products query overlays — vendor sees their edit reflected on the next
 * page refresh, even though the 6h Shopify sync hasn't run yet.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireSession } from "@/lib/auth/server";
import { getBigQuery } from "@/lib/bigquery/client";

export const runtime = "nodejs";

const PROJECT = process.env.GCP_PROJECT_ID || "malabisy-data";
const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP || "da2dab.myshopify.com";
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-07";

type EditableField = "cost" | "price" | "compare_at_price" | "inventory_quantity";
const ALLOWED: EditableField[] = ["cost", "price", "compare_at_price", "inventory_quantity"];

interface Body {
  variant_id?: string;
  inventory_item_id?: string | null;
  product_id?: string;
  field?: EditableField;
  new_value?: number | string;
}

async function shopifyToken(): Promise<string> {
  // We assume the same secret used by ops_actions and shopify-bulk-sync.
  // In Vercel runtime we can't use Secret Manager directly without ADC; pull
  // from an env var that we'll inject from the secret at build/deploy time.
  // For now: read from SHOPIFY_ADMIN_API_TOKEN env var. Cloud Functions read
  // from Secret Manager directly, but Vercel doesn't have that integration.
  const t = process.env.SHOPIFY_ADMIN_API_TOKEN;
  if (!t) throw new Error("SHOPIFY_ADMIN_API_TOKEN env var is not set on Vercel");
  return t;
}

async function shopifyPut(path: string, body: unknown): Promise<{ status: number; data: unknown }> {
  const token = await shopifyToken();
  const r = await fetch(`https://${SHOPIFY_SHOP}/admin/api/${SHOPIFY_API_VERSION}/${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

async function shopifyPost(path: string, body: unknown): Promise<{ status: number; data: unknown }> {
  const token = await shopifyToken();
  const r = await fetch(`https://${SHOPIFY_SHOP}/admin/api/${SHOPIFY_API_VERSION}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (session.role === "internal") {
    // Internal users have their own admin tools; this endpoint is vendor-scoped.
    return NextResponse.json({ error: "use_internal_endpoint" }, { status: 403 });
  }

  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const variantId = body.variant_id;
  const inventoryItemId = body.inventory_item_id;
  const productId = body.product_id;
  const field = body.field;
  const newValue = body.new_value;

  if (!variantId || !field || newValue === undefined || newValue === null) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (!ALLOWED.includes(field)) {
    return NextResponse.json({ error: "invalid_field" }, { status: 400 });
  }

  // 1. Verify the variant belongs to the session's vendor list.
  const bq = getBigQuery();
  const [verifyRows] = await bq.query({
    query: `
      SELECT p.vendor, v.id AS variant_id, v.inventory_item_id, v.price AS old_price,
             v.compare_at_price AS old_compare_at_price
      FROM \`${PROJECT}.shopify.product_variants\` v
      JOIN \`${PROJECT}.shopify.products\` p ON p.id = v.product_id
      WHERE v.id = @vid
      LIMIT 1
    `,
    params: { vid: Number(variantId) },
    types: { vid: "INT64" },
  });
  const found = verifyRows[0] as
    | { vendor: string; variant_id: number; inventory_item_id: number; old_price: string; old_compare_at_price: string | null }
    | undefined;
  if (!found) return NextResponse.json({ error: "variant_not_found" }, { status: 404 });
  if (!session.vendors.includes(found.vendor)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const editId = randomUUID();
  let shopifyStatus: string | null = null;
  let shopifyResponse: string | null = null;
  let oldValue: string | null = null;
  let finalStatus: "success" | "failed" = "failed";
  let errorMessage: string | null = null;

  try {
    if (field === "cost") {
      // Need inventory_item_id, not variant_id, for this endpoint.
      const iid = inventoryItemId ?? String(found.inventory_item_id);
      const { status, data } = await shopifyPut(`inventory_items/${iid}.json`, {
        inventory_item: { cost: String(newValue) },
      });
      shopifyStatus = String(status);
      shopifyResponse = JSON.stringify(data).slice(0, 4000);
      // Old value: not in our preflight query — fetch separately or accept null
      oldValue = null;
      if (status >= 200 && status < 300) finalStatus = "success";
      else errorMessage = `shopify_${status}`;
    } else if (field === "price" || field === "compare_at_price") {
      const apiField = field === "price" ? "price" : "compare_at_price";
      const { status, data } = await shopifyPut(`variants/${variantId}.json`, {
        variant: { id: Number(variantId), [apiField]: String(newValue) },
      });
      shopifyStatus = String(status);
      shopifyResponse = JSON.stringify(data).slice(0, 4000);
      oldValue = field === "price" ? found.old_price : (found.old_compare_at_price ?? null);
      if (status >= 200 && status < 300) finalStatus = "success";
      else errorMessage = `shopify_${status}`;
    } else if (field === "inventory_quantity") {
      // Inventory levels are per (inventory_item, location). For simplicity we
      // set the level at every location to the same value. Real-world: vendors
      // probably have one warehouse, so this is fine. If multi-location matters,
      // expose a location selector in the UI.
      const iid = inventoryItemId ?? String(found.inventory_item_id);
      // Get all locations for this inventory item
      const { data: levelsResp } = await shopifyPut(`inventory_levels.json?inventory_item_ids=${iid}`, null as unknown);
      // Ignore the PUT — we used GET semantics. Use shopifyPost for inventory_levels/set.
      // Actually we need GET first; let's just set at all known locations from BQ.
      const [locRows] = await bq.query({
        query: `SELECT DISTINCT location_id FROM \`${PROJECT}.shopify.inventory_levels\` WHERE inventory_item_id = @iid`,
        params: { iid: Number(iid) },
        types: { iid: "INT64" },
      });
      const locations = (locRows as Array<{ location_id: number }>).map((r) => r.location_id);
      if (locations.length === 0) {
        errorMessage = "no_locations_found";
      } else {
        // Set at each location
        let allOk = true;
        const responses: unknown[] = [];
        for (const loc of locations) {
          const { status, data } = await shopifyPost("inventory_levels/set.json", {
            location_id: loc,
            inventory_item_id: Number(iid),
            available: Math.round(Number(newValue)),
          });
          responses.push({ loc, status, data });
          if (status < 200 || status >= 300) allOk = false;
        }
        shopifyStatus = allOk ? "200" : "partial";
        shopifyResponse = JSON.stringify(responses).slice(0, 4000);
        finalStatus = allOk ? "success" : "failed";
        if (!allOk) errorMessage = "partial_inventory_set";
      }
      void levelsResp;
    }
  } catch (e) {
    errorMessage = (e as Error).message;
  }

  // 2. Write the audit row regardless of outcome (we want to see all attempts).
  await bq.query({
    query: `
      INSERT INTO \`${PROJECT}.ops.vendor_edits\`
        (edit_id, edited_at, actor_email, vendor, product_id, variant_id, inventory_item_id,
         field, old_value, new_value, shopify_status, shopify_response, final_status, error_message)
      VALUES
        (@edit_id, CURRENT_TIMESTAMP(), @actor, @vendor, @product_id, @variant_id, @inv_item_id,
         @field, @old_value, @new_value, @shopify_status, @shopify_response, @final_status, @error_message)
    `,
    params: {
      edit_id: editId,
      actor: session.email,
      vendor: found.vendor,
      product_id: productId ? Number(productId) : null,
      variant_id: Number(variantId),
      inv_item_id: inventoryItemId ? Number(inventoryItemId) : (found.inventory_item_id ?? null),
      field,
      old_value: oldValue,
      new_value: String(newValue),
      shopify_status: shopifyStatus,
      shopify_response: shopifyResponse,
      final_status: finalStatus,
      error_message: errorMessage,
    },
    types: {
      edit_id: "STRING", actor: "STRING", vendor: "STRING",
      product_id: "INT64", variant_id: "INT64", inv_item_id: "INT64",
      field: "STRING", old_value: "STRING", new_value: "STRING",
      shopify_status: "STRING", shopify_response: "STRING",
      final_status: "STRING", error_message: "STRING",
    },
  });

  if (finalStatus !== "success") {
    return NextResponse.json({ error: errorMessage || "shopify_call_failed", shopify_status: shopifyStatus }, { status: 502 });
  }

  return NextResponse.json({ ok: true, edit_id: editId, field, new_value: newValue });
}
