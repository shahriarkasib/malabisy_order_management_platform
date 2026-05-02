/**
 * Session: signed JWT-style cookie carrying { email, role, vendors[] }.
 * Signed with HS256 using AUTH_SECRET. 7-day expiry.
 *
 * This is intentionally minimal — we'll migrate to Clerk for production-grade
 * auth (password reset, MFA, SSO). For now we just need: log in with email +
 * password, persist who you are, scope queries by your vendor list.
 */

import { SignJWT, jwtVerify } from "jose";

const SECRET = process.env.AUTH_SECRET;
if (!SECRET) {
  // Dev safety: tell us up front rather than letting tokens be unsignable.
  console.warn("[auth] AUTH_SECRET not set — sessions will fail to sign");
}

const KEY = new TextEncoder().encode(SECRET || "dev-only-not-secure-do-not-use-in-prod");
const ALG = "HS256";

export const SESSION_COOKIE = "mob_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface Session {
  email: string;
  role: "internal" | "owner" | "viewer";
  vendors: string[]; // empty for internal users (means "all vendors")
  display_name?: string;
}

export async function signSession(s: Session): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  return await new SignJWT({ ...s })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(exp)
    .setSubject(s.email)
    .sign(KEY);
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, KEY, { algorithms: [ALG] });
    if (typeof payload.email !== "string" || typeof payload.role !== "string") return null;
    return {
      email: payload.email,
      role: payload.role as Session["role"],
      vendors: Array.isArray(payload.vendors) ? (payload.vendors as string[]) : [],
      display_name: typeof payload.display_name === "string" ? payload.display_name : undefined,
    };
  } catch {
    return null;
  }
}
