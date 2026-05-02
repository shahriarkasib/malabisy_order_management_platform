import { NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth/server";
import { fetchRecentFailures } from "@/lib/bigquery/notification-queries";

export const runtime = "nodejs";

export async function GET() {
  await requireInternal();
  const items = await fetchRecentFailures({ limit: 30, days: 7 });
  return NextResponse.json({ items });
}
