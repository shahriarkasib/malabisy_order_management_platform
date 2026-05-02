/**
 * Admin team management.
 *
 *   POST   /api/admin/admins  { email, display_name? }   → invite a new admin
 *   DELETE /api/admin/admins?email=…                     → revoke admin
 *
 * Safety: callers must already be admin (requireInternal). You can't remove
 * yourself — last-line defence against locking everyone out.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth/server";
import { getBigQuery } from "@/lib/bigquery/client";

export const runtime = "nodejs";

const PROJECT = process.env.GCP_PROJECT_ID || "malabisy-data";

export async function POST(req: NextRequest) {
  const session = await requireInternal();
  let body: { email?: string; display_name?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const email = (body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return NextResponse.json({ error: "invalid_email" }, { status: 400 });

  const bq = getBigQuery();
  const [existing] = await bq.query({
    query: `SELECT email, role, active FROM \`${PROJECT}.ops.vendor_accounts\` WHERE LOWER(email) = @email LIMIT 1`,
    params: { email },
    types: { email: "STRING" },
  });
  const row = (existing as Array<{ role: string; active: boolean }>)[0];

  if (row) {
    if (row.role === "internal" && row.active) {
      return NextResponse.json({ ok: true, status: "already_admin" });
    }
    // Promote / reactivate.
    await bq.query({
      query: `UPDATE \`${PROJECT}.ops.vendor_accounts\` SET role = 'internal', active = TRUE WHERE LOWER(email) = @email`,
      params: { email },
      types: { email: "STRING" },
    });
    return NextResponse.json({ ok: true, status: "promoted" });
  }

  // Insert fresh admin.
  await bq.query({
    query: `
      INSERT INTO \`${PROJECT}.ops.vendor_accounts\` (email, role, display_name, active, created_at, invited_by)
      VALUES (@email, 'internal', @name, TRUE, CURRENT_TIMESTAMP(), @by)
    `,
    params: { email, name: body.display_name ?? email.split("@")[0], by: session.email },
    types: { email: "STRING", name: "STRING", by: "STRING" },
  });
  return NextResponse.json({ ok: true, status: "created" });
}

export async function DELETE(req: NextRequest) {
  const session = await requireInternal();
  const email = (new URL(req.url).searchParams.get("email") || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "missing_email" }, { status: 400 });
  if (email === session.email.toLowerCase()) {
    return NextResponse.json({ error: "cant_remove_self" }, { status: 400 });
  }

  const bq = getBigQuery();
  await bq.query({
    query: `UPDATE \`${PROJECT}.ops.vendor_accounts\` SET active = FALSE WHERE LOWER(email) = @email AND role = 'internal'`,
    params: { email },
    types: { email: "STRING" },
  });
  return NextResponse.json({ ok: true });
}
