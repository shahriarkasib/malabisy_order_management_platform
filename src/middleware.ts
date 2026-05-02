/**
 * Edge middleware: gates routes by role before any page renders.
 *
 *   Internal pages   (/orders, /audit, /vendors, /analytics, /settings)
 *     - require role 'internal'
 *     - vendor users get redirected to /vendor
 *   Vendor portal    (/vendor/**)
 *     - require role 'owner' or 'viewer'
 *     - internal users get redirected to /orders
 *   Public           (/login, /api/auth/login, /api/auth/logout, static assets)
 *     - no auth required
 *
 * jose works in the Edge runtime; bcryptjs doesn't, but we don't need it here.
 */

import { NextResponse, type NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/session";

const PUBLIC_PATHS = new Set(["/login"]);
const PUBLIC_PREFIXES = ["/api/auth/", "/_next/", "/favicon"];
const INTERNAL_PATHS = ["/orders", "/audit", "/vendors", "/analytics", "/settings"];
const VENDOR_PATHS = ["/vendor"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public — let through.
  if (PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Resolve session.
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  const goingInternal = pathname === "/" || INTERNAL_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const goingVendor = VENDOR_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!session) {
    // No session → must log in.
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Vendor user touching an internal page → bounce to vendor portal.
  if (goingInternal && session.role !== "internal") {
    const url = req.nextUrl.clone();
    url.pathname = "/vendor";
    return NextResponse.redirect(url);
  }

  // Internal user touching the vendor portal → bounce to internal home.
  if (goingVendor && session.role === "internal") {
    const url = req.nextUrl.clone();
    url.pathname = "/orders";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on everything EXCEPT static assets and API routes that handle their own auth.
    "/((?!_next/static|_next/image|favicon|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)",
  ],
};
