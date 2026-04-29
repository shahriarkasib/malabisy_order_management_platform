import type { PipelineTab, Direction } from "@/lib/constants";

export interface LineItem {
  order_id: string;
  order_number: string;
  order_date: string;
  created_at: string;

  line_item_id: string;
  sku: string;
  product_title: string;
  variant_name: string | null;
  quantity: number;

  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;

  vendor: string | null;
  payment_type: string | null;

  bosta_delivery_id: string | null;
  logestechs_shipment_id: number | null;
  tracking_number: string | null;
  tracking_company: string | null;
  courier_name: string | null;
  shipping_city: string | null;
  pickup_location: string | null;
  dropoff_city: string | null;

  bosta_state_value: string | null;
  bosta_type: string | null;
  display_status: string | null;
  pipeline_tab: PipelineTab;
  direction: Direction;

  elapsed_days: number | null;
  elapsed_days_since_last_update: number | null;
  attempts_count: number | null;
  calls_number: number | null;

  item_price: number | null;
  net_line_total: number | null;
  commission: number | null;
  vendor_payout: number | null;
  total_fees: number | null;
  cod_amount: number | null;

  is_exception: boolean | null;
  needs_confirmation: boolean | null;
  is_confirmed: boolean | null;
  exception_reason: string | null;
  last_exception_code: string | null;

  return_reason: string | null;
}

export interface AuditEntry {
  event_id: string;
  clicked_at: string;
  actor_email: string | null;
  action: string;
  shopify_order_id: string | null;
  shopify_order_name: string | null;
  tracking_number: string | null;
  bosta_delivery_id: string | null;
  logestechs_shipment_id: number | null;
  courier: string | null;
  payload_json: string | null;
  dry_run: boolean;
  shopify_status: string | null;
  shopify_response: string | null;
  courier_status: string | null;
  courier_response: string | null;
  inventory_status: string | null;
  final_status: string | null;
  error_message: string | null;
  duration_ms: number | null;
}

export interface TabCount {
  pipeline_tab: PipelineTab;
  count: number;
}
