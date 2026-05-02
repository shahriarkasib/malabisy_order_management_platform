import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getBigQuery } from "@/lib/bigquery/client";
import { signSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth/session";

export const runtime = "nodejs";

const PROJECT = process.env.GCP_PROJECT_ID || "malabisy-data";

interface LoginBody {
  email?: string;
  password?: string;
}

export async function POST(req: NextRequest) {
  let body: LoginBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!email || !password) {
    return NextResponse.json({ error: "missing_credentials" }, { status: 400 });
  }

  // Look up the account + their vendor mappings in one query.
  const bq = getBigQuery();
  const [rows] = await bq.query({
    query: `
      SELECT a.email, a.password_hash, a.role, a.display_name,
             ARRAY(SELECT v.vendor FROM \`${PROJECT}.ops.vendor_user_access\` v
                   WHERE v.email = a.email) AS vendors
      FROM \`${PROJECT}.ops.vendor_accounts\` a
      WHERE LOWER(a.email) = @email AND a.active = TRUE
    `,
    params: { email },
    types: { email: "STRING" },
  });

  const row = rows[0] as
    | { email: string; password_hash: string | null; role: string; display_name: string | null; vendors: string[] }
    | undefined;

  if (!row || !row.password_hash) {
    // Constant-time-ish: still hash the input even if we know it'll fail.
    await bcrypt.compare(password, "$2b$10$".padEnd(60, "x"));
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });

  // best-effort: bump last_login_at, don't fail the login if it errors
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
