import { NextRequest, NextResponse } from "next/server";
import { cf } from "@/lib/api/cloud-functions";

export const runtime = "nodejs";

const HANDLERS: Record<string, (body: any) => Promise<unknown>> = {
  "cancel-order": (b) => cf.cancelOrder(b),
  "remove-item": (b) => cf.removeItem(b),
  "auto-awb": (b) => cf.autoAwb(b),
  "change-courier": (b) => cf.changeCourier(b),
  "set-status": (b) => cf.setStatus(b),
  "confirm-order": (b) => cf.confirmOrder(b),
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  const handler = HANDLERS[action];
  if (!handler) return NextResponse.json({ error: `unknown_action:${action}` }, { status: 404 });

  try {
    const body = await req.json();
    // TODO: derive actor_email from auth session instead of trusting client
    const result = await handler(body);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
