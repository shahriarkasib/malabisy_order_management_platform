/**
 * POST /api/admin/refresh   { source: "warehouse" | "shopify" | "bosta" }
 *
 * Fires the underlying job and returns immediately. Job runs async on GCP —
 * caller polls /settings to see the freshness badge update.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth/server";
import { triggerDtsRun, triggerCloudRun } from "@/lib/gcp/trigger";

export const runtime = "nodejs";

interface Body { source?: string }

export async function POST(req: NextRequest) {
  await requireInternal();
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  try {
    switch (body.source) {
      case "warehouse": {
        const out = await triggerDtsRun("warehouse_query");
        return NextResponse.json({ ok: true, source: "warehouse", ...out, message: "Started — typically takes 2-3 minutes." });
      }
      case "shopify": {
        const out = await triggerCloudRun("shopify_bulk_sync");
        return NextResponse.json({ ok: true, source: "shopify", ...out, message: "Started — runs ~25 minutes for full bulk sync." });
      }
      case "bosta": {
        const out = await triggerCloudRun("bosta_sync");
        return NextResponse.json({ ok: true, source: "bosta", ...out, message: "Started — usually finishes in seconds." });
      }
      default:
        return NextResponse.json({ error: "invalid_source" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "trigger_failed" }, { status: 500 });
  }
}
