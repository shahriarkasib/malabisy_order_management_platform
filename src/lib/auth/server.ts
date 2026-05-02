/**
 * Server-side auth helpers — call from Server Components, Server Actions,
 * and route handlers. Reads the session cookie from the request and resolves
 * to a typed Session.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession, type Session } from "./session";

export async function getSession(): Promise<Session | null> {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(cookie);
}

/** Throws redirect to /login if no valid session. Use at the top of every protected route. */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

/** Redirects vendor users away from internal pages. */
export async function requireInternal(): Promise<Session> {
  const s = await requireSession();
  if (s.role !== "internal") redirect("/vendor");
  return s;
}

/** Redirects internal users to internal dashboard; throws if no session. */
export async function requireVendor(): Promise<Session & { vendors: string[] }> {
  const s = await requireSession();
  if (s.role === "internal") redirect("/orders");
  if (!s.vendors || s.vendors.length === 0) {
    // Vendor account exists but has no vendor mapping — orphaned. Force logout.
    redirect("/login?error=no_vendor_access");
  }
  return s as Session & { vendors: string[] };
}
