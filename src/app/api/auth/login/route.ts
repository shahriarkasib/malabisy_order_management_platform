/**
 * Email-only login. No password.
 *
 * The allowlist lives in BQ: ops.vendor_accounts. If the email is there and
 * active, we sign a session. This is the same simplicity Slack/Notion give
 * for invite-only workspaces — the security boundary is "Malabisy controls
 * who's in the table."
 *
 * Migrate to Clerk for SSO + magic links when this graduates from internal-tool
 * stage. For now, the threat model is: ops admins manage who has access in BQ.
 */

import { NextRequest, NextResponse } from "next/server";
import { getBigQuery } from "@/lib/bigquery/client";
import { signSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth/session";

export const runtime = "nodejs";

const PROJECT = process.env.GCP_PROJECT_ID || "malabisy-data";

interface LoginBody {
  email?: string;
}

export async function POST(req: NextRequest) {
  let body: LoginBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "email_required" }, { status: 400 });
  }

  const bq = getBigQuery();
  const [rows] = await bq.query({
    query: `
      SELECT a.email, a.role, a.display_name,
             ARRAY(SELECT v.vendor FROM \`${PROJECT}.ops.vendor_user_access\` v
                   WHERE LOWER(v.email) = LOWER(a.email)) AS vendors
      FROM \`${PROJECT}.ops.vendor_accounts\` a
      WHERE LOWER(a.email) = @email AND a.active = TRUE
    `,
    params: { email },
    types: { email: "STRING" },
  });

  const row = rows[0] as
    | { email: string; role: string; display_name: string | null; vendors: string[] }
    | undefined;

  if (!row) {
    return NextResponse.json({ error: "not_authorized" }, { status: 401 });
  }

  // Owners must have at least one vendor mapped, else they'd be locked out.
  if (row.role === "owner" && (!row.vendors || row.vendors.length === 0)) {
    return NextResponse.json({ error: "no_vendor_access" }, { status: 403 });
  }

  // Best-effort: stamp last_login_at. Don't block login on this.
  bq.query({
    query: `UPDATE \`${PROJECT}.ops.vendor_accounts\` SET last_login_at = CURRENT_TIMESTAMP() WHERE LOWER(email) = @email`,
    params: { email },
    types: { email: "STRING" },
  }).catch(() => {});

  const token = await signSession({
    email: row.email,
    role: row.role as "internal" | "owner" | "viewer",
    vendors: row.vendors ?? [],
    display_name: row.display_name ?? undefined,
  });

  const res = NextResponse.json({ ok: true, role: row.role, vendors: row.vendors });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
