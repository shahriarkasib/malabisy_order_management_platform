import { CF_ENDPOINTS } from "@/lib/constants";

const CF_BASE = process.env.NEXT_PUBLIC_CF_BASE || "https://us-central1-malabisy-data.cloudfunctions.net";
const CF_TOKEN = process.env.OPS_ACTIONS_TOKEN || "";

interface CallOptions {
  body: Record<string, unknown>;
  endpoint: keyof typeof CF_ENDPOINTS;
}

export interface CFResponse {
  status?: string;
  errors?: string[];
  event_id?: string;
  dry_run?: boolean;
  [key: string]: unknown;
}

export async function callCloudFunction({ endpoint, body }: CallOptions): Promise<CFResponse> {
  const url = `${CF_BASE}/${CF_ENDPOINTS[endpoint]}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Ops-Token": CF_TOKEN,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as CFResponse;
  if (!res.ok) {
    throw new Error(`CF ${endpoint} ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

// Typed wrappers for each endpoint
export const cf = {
  cancelOrder: (body: {
    shopify_order_id: number | string;
    actor_email: string;
    reason?: string;
    dry_run?: boolean;
  }) => callCloudFunction({ endpoint: "cancelOrder", body }),

  removeItem: (body: {
    shopify_order_id: number | string;
    line_item_id: number | string;
    quantity?: number;
    actor_email: string;
    reason?: string;
    restock?: boolean;
    refund_shipping?: boolean;
    dry_run?: boolean;
  }) => callCloudFunction({ endpoint: "removeItem", body }),

  autoAwb: (body: {
    shopify_order_id: number | string;
    actor_email: string;
    courier_override?: string;
    pickup_location_id?: string;
    dry_run?: boolean;
  }) => callCloudFunction({ endpoint: "autoAwb", body }),

  changeCourier: (body: {
    shopify_order_id: number | string;
    actor_email: string;
    current_courier: string;
    new_courier: string;
    current_bosta_delivery_id?: string;
    current_logestechs_shipment_id?: number;
    pickup_location_id?: string;
    dry_run?: boolean;
  }) => callCloudFunction({ endpoint: "changeCourier", body }),

  setStatus: (body: {
    line_item_id: number | string;
    override_status: string;
    actor_email: string;
    shopify_order_id?: number | string;
    note?: string;
    dry_run?: boolean;
  }) => callCloudFunction({ endpoint: "setStatus", body }),

  confirmOrder: (body: {
    shopify_order_id: number | string;
    actor_email: string;
    line_item_id?: number | string;
    note?: string;
    dry_run?: boolean;
  }) => callCloudFunction({ endpoint: "confirmOrder", body }),
};
