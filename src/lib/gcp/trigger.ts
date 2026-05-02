/**
 * Server-only helpers for kicking off backend jobs from the Vercel app.
 *
 *  - triggerWarehouseQuery()       → DTS startManualRuns on warehouse_query
 *  - triggerShopifyBulkSync()      → POST shopify-bulk-sync Cloud Run service
 *  - triggerBostaSync()            → POST bosta-sync Cloud Run service
 *
 * All three authenticate as the SA whose JSON we already inject into Vercel as
 * GCP_SERVICE_ACCOUNT_JSON (vercel-bq-reader). That SA was granted bigquery.admin
 * + run.invoker on each function service. See the IAM bindings on those services.
 */

import { GoogleAuth } from "google-auth-library";

const PROJECT = process.env.GCP_PROJECT_ID || "malabisy-data";
const PROJECT_NUMBER = process.env.GCP_PROJECT_NUMBER || "266684587625";

// DTS config IDs — these don't change, hardcoded.
const DTS_CONFIGS = {
  warehouse_query:           "69fe9eea-0000-2dc1-8917-fc41169168e9",
  shopify_realtime_dedup:    "6a00f5c8-0000-2464-bfcc-f4f5e80d7158",
} as const;

// Cloud Run URLs.
const FN_URLS = {
  shopify_bulk_sync: "https://shopify-bulk-sync-h4l47jop4q-uc.a.run.app",
  bosta_sync:        "https://bosta-sync-h4l47jop4q-uc.a.run.app",
} as const;

function getAuth(): GoogleAuth {
  // GoogleAuth picks up credentials from GCP_SERVICE_ACCOUNT_JSON via our
  // BigQuery client init. For trigger calls we instantiate a fresh GoogleAuth.
  const inlineKey = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!inlineKey) {
    throw new Error("GCP_SERVICE_ACCOUNT_JSON env var not set");
  }
  const credentials = JSON.parse(inlineKey);
  return new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
}

/** Trigger a DTS scheduled query to run NOW. Returns the run name on success. */
export async function triggerDtsRun(configKey: keyof typeof DTS_CONFIGS): Promise<{ run_id: string }> {
  const auth = getAuth();
  const client = await auth.getClient();
  const url = `https://bigquerydatatransfer.googleapis.com/v1/projects/${PROJECT_NUMBER}/locations/us/transferConfigs/${DTS_CONFIGS[configKey]}:startManualRuns`;
  const resp = await client.request<{ runs?: Array<{ name: string }> }>({
    url,
    method: "POST",
    data: { requestedRunTime: new Date().toISOString() },
  });
  const runName = resp.data.runs?.[0]?.name ?? "unknown";
  return { run_id: runName.split("/").pop() || runName };
}

/** Invoke a Cloud Run service with an OIDC token (the function's audience). */
export async function triggerCloudRun(serviceKey: keyof typeof FN_URLS): Promise<{ status: number; data: unknown }> {
  const url = FN_URLS[serviceKey];
  const auth = getAuth();
  // For Cloud Run we need an ID token whose audience matches the service URL.
  const client = await auth.getIdTokenClient(url);
  const resp = await client.request({ url, method: "POST" });
  return { status: resp.status as number, data: resp.data };
}

export const TRIGGER_TARGETS = {
  warehouse: { key: "warehouse_query",   kind: "dts" } as const,
  shopify:   { key: "shopify_bulk_sync", kind: "run" } as const,
  bosta:     { key: "bosta_sync",        kind: "run" } as const,
};

void PROJECT;
