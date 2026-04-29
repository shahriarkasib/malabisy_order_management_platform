# Malabisy Order Management Platform

Production-grade order management for Malabisy. Replaces the Retool dashboard with a custom-branded, owned, scalable platform that serves both the ops team and (eventually) external vendors.

## Stack

- **Next.js 15** (App Router) + **TypeScript (strict)**
- **Tailwind CSS v4** + **shadcn-style components** (Radix primitives)
- **TanStack Table** for data grids
- **TanStack Query** for client-side data fetching
- **Sonner** for toasts
- **Lucide** for icons
- **Zod + React Hook Form** for forms
- **@google-cloud/bigquery** server-side reads
- **Clerk** (planned) for auth + roles

## Architecture

```
Browser
  │
  ▼
Next.js (Vercel)
  ├── Server Components → BigQuery (read)
  ├── API Routes        → Cloud Functions (write)
  └── Client Components → action UI
       │
       ▼
GCP Cloud Functions (existing, unchanged)
       │
       ▼
BigQuery: gold.line_item_pipeline, ops.button_audit, ops.status_overrides …
```

The Cloud Functions in `cloud_functions/ops_actions/` handle every write operation (cancel, refund, AWB create, etc.). This app is the **frontend layer** on top — it does direct BigQuery reads for the dashboard and proxies writes through the existing Cloud Functions.

## Getting started

```bash
cp .env.example .env.local
# Fill in:
#   GCP_PROJECT_ID=malabisy-data
#   GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/sa-key.json   (local dev)
#   OPS_ACTIONS_TOKEN=<value of secret ops-actions-shared-token>

npm install
npm run dev
# open http://localhost:3000
```

For BigQuery reads locally, either:

1. Run `gcloud auth application-default login` (uses your gcloud creds), or
2. Download a service account key JSON and set `GOOGLE_APPLICATION_CREDENTIALS`.

The service account needs `roles/bigquery.dataViewer` and `roles/bigquery.jobUser` on `malabisy-data`.

## Project structure

```
src/
├── app/
│   ├── layout.tsx           # root layout: sidebar + header + content
│   ├── page.tsx             # dashboard home
│   ├── orders/page.tsx      # orders pipeline (server component)
│   ├── audit/page.tsx       # audit log
│   ├── vendors/page.tsx     # placeholder
│   ├── analytics/page.tsx   # placeholder
│   ├── settings/page.tsx    # placeholder
│   └── api/
│       └── actions/[action]/route.ts  # proxy to Cloud Functions
├── components/
│   ├── ui/                  # buttons, badges, inputs (shadcn-style)
│   ├── layout/              # sidebar, header
│   └── orders/              # table, action bar, pipeline tabs
├── lib/
│   ├── bigquery/            # BQ client + queries
│   ├── api/                 # Cloud Function client
│   ├── constants.ts
│   └── utils.ts
└── types/                   # shared TypeScript types
```

## Deploy to Vercel

```bash
vercel link
vercel env add GCP_PROJECT_ID            # malabisy-data
vercel env add GCP_SERVICE_ACCOUNT_JSON  # full JSON of an SA key (BigQuery viewer + jobUser)
vercel env add OPS_ACTIONS_TOKEN         # value from `gcloud secrets versions access latest --secret=ops-actions-shared-token`
vercel env add NEXT_PUBLIC_CF_BASE       # https://us-central1-malabisy-data.cloudfunctions.net

# subsequent deploys happen automatically on git push to main
```

## Auth (planned, last phase)

Clerk will be added at the end. When integrated:

- Ops users get full access to `/orders`, `/audit`, `/vendors`, `/settings`.
- Vendor users get a scoped `/vendor` view with only their own vendor's data.
- Action buttons gate by role — vendors can mark items shipped on their own orders, but can't cancel or refund.
- All actions log `actor_email` from Clerk's session, not the client.

## Roadmap

- [ ] Vendor portal (scoped reads + scoped writes)
- [ ] Real-time order ingestion via Pub/Sub (replaces hourly Airbyte sync)
- [ ] Dashboard charts (sales, courier performance, vendor leaderboard)
- [ ] Mobile-responsive table view
