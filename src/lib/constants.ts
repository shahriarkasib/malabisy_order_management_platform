export const APP_NAME = "Malabisy Ops";

export const PIPELINE_TABS = [
  "All Orders",
  "New Orders",
  "Late Orders",
  "Confirmation Step",
  "Ready to Ship",
  "In Transit",
  "Delivered",
  "Exceptions",
  "RTO",
  "Cancelled",
  "Rejected",
  "Rejected Return",
] as const;

export type PipelineTab = (typeof PIPELINE_TABS)[number];

export const OVERRIDE_STATUSES = [
  "Delivered",
  "Lost",
  "Cancelled",
  "RTO",
  "Exceptions",
  "In Transit",
  "Ready to Ship",
  "Late Orders",
  "New Orders",
  "Confirmation Step",
  "Rejected",
  "Rejected Return",
] as const;

export type OverrideStatus = (typeof OVERRIDE_STATUSES)[number];

export const DIRECTIONS = ["All", "Forward", "Reverse"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const COURIERS = ["Bosta", "Logestechs", "MB Logistics"] as const;
export type Courier = (typeof COURIERS)[number];

export const CF_ENDPOINTS = {
  cancelOrder: "ops-cancel-order",
  removeItem: "ops-remove-item",
  autoAwb: "ops-auto-awb",
  changeCourier: "ops-change-courier",
  setStatus: "ops-set-status",
  confirmOrder: "ops-confirm-order",
  reflectStatus: "ops-reflect-status",
} as const;
