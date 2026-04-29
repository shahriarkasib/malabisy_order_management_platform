import { BigQuery } from "@google-cloud/bigquery";

let cached: BigQuery | null = null;

/**
 * Returns a singleton BigQuery client.
 *
 * Auth resolution order:
 *   1. GCP_SERVICE_ACCOUNT_JSON env var (stringified key — used on Vercel)
 *   2. GOOGLE_APPLICATION_CREDENTIALS env var (path to key file — used locally)
 *   3. Application Default Credentials (gcloud auth login)
 */
export function getBigQuery(): BigQuery {
  if (cached) return cached;

  const projectId = process.env.GCP_PROJECT_ID || "malabisy-data";
  const inlineKey = process.env.GCP_SERVICE_ACCOUNT_JSON;

  if (inlineKey) {
    const credentials = JSON.parse(inlineKey);
    cached = new BigQuery({ projectId, credentials });
  } else {
    cached = new BigQuery({ projectId });
  }

  return cached;
}
