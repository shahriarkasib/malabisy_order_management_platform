/**
 * Admin endpoints for managing vendor access.
 *
 *   POST   /api/admin/vendor-access  { email, vendor }     → grant
 *   DELETE /api/admin/vendor-access?email=…&vendor=…       → revoke
 *
 * Both require requireInternal(). No invite emails are sent yet — once we
 * migrate to Clerk we'll wire up magic-link invites.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth/server";
import { grantVendorAccess, revokeVendorAccess } from "@/lib/bigquery/admin-queries";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await requireInternal();
  let body: { email?: string; vendor?: string; display_name?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const email = (body.email || "").trim().toLowerCase();
  const vendor = (body.vendor || "").trim();
  if (!email || !vendor) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  if (!email.includes("@")) return NextResponse.json({ error: "invalid_email" }, { status: 400 });

  const result = await grantVendorAccess({
    email,
    vendor,
    granted_by: session.email,
    display_name: body.display_name,
  });
  return NextResponse.json({ ok: true, ...result });
}

export async function DELETE(req: NextRequest) {
  await requireInternal();
  const url = new URL(req.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const vendor = (url.searchParams.get("vendor") || "").trim();
  if (!email || !vendor) return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  const result = await revokeVendorAccess(email, vendor);
  return NextResponse.json({ ok: true, ...result });
}
