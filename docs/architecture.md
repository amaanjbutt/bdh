# Architecture

## System map

```
              publishers (Bangladesh Bank, BBS, NBR, EPB, DSE)
                 │                 │                 │
     F5/WAF      │                 │ HTML / JSON /   │ XLSX / PDF
     challenge   │                 │ XLSX            │
                 ▼                 ▼                 ▼
        browser_fetch      GitHub Actions       manual backfill
        (Chrome, workstation)  Ingest workflow   (same job, --backfill)
                 │                 │                 │
                 └────────────────►│◄────────────────┘
                                   ▼
                 ┌────────────────────────────────────┐
                 │ Python ingestion + Postgres 16     │
                 │ restore R2 snapshot → run jobs →   │
                 │ dump snapshot → sync changed rows  │
                 └────────────────────────────────────┘
                                   │ /admin/sync
                                   ▼
                 ┌────────────────────────────────────┐
                 │ Cloudflare D1 (serving database)   │
                 └────────────────────────────────────┘
                                   ▲ service binding
                 Cloudflare Worker `bangladatahub-api`
                 catalog · series · market · funds · DAM · cron
                                   ▲
                 Cloudflare Worker `bangladatahub`
                 TanStack Start SSR · edge cache · bot renderer
```

- **Cloudflare** runs the public API (`bangladatahub-api`), D1, R2 and the website
  (`bangladatahub`). The frontend calls the API through a service binding.
- **GitHub Actions** runs the heavy Python ingestion. The runner restores the last
  Postgres snapshot from R2, runs the jobs, uploads the new snapshot, and syncs changed
  rows to D1. No VPS is required.
- **Raw archive** is written to local storage and mirrored to Cloudflare R2.
  `source_documents` records the SHA-256, source URL, content type and object key.
  R2 also holds `series/<id>.json` flat-file exports (metadata + observations +
  revisions) for backup/portability; D1 remains the SQL serving layer.
- **Ingestion** is a Python framework: fetch → archive → parse → validate → upsert → run
  row → alert → webhooks (incremental only).
- The **FastAPI app + Postgres** remain the local/dev implementation and the canonical
  ingestion writer. D1 mirrors the public read model.

## Backend

**Data model** — everything that is a time series lives in `series` + `observations`:

- `series`: id, module, name, description, unit, frequency, source, source_url, dimensions,
  plausibility bounds, first/last date, tier, derivation, canonical_id.
- `observations`: PK `(series_id, obs_date, dims)`, value, flagged, revised_at, first_seen_at.
- `observation_revisions`: append-only prior values, written by a trigger when a value changes.
- `observation_notes`: publisher-confirmed odd values and data-quality annotations.
- Dedicated tables for richer shapes: `dse_securities`, `dse_prices`, `dse_indices`,
  `dse_market_daily`, `source_documents`, `release_calendar`, `dq_*`.
- Users/billing: `users`, `api_keys`, `sessions`, `billing_events`, `webhooks`, `usage_daily`.

**API** — FastAPI routers in `app/api/`:

| Router | Endpoints |
|---|---|
| `catalog` | `/v1/catalog`, modules, counts |
| `series` | `/v1/series/{id}`, `/latest`, `/revisions`, transforms, CSV |
| `market` | `/v1/market/overview`, `/securities`, `/movers`, `/sectors` |
| `regional` | `/v1/regional/districts`, `/district/{name}` |
| `topics`/`search` | `/v1/search`, entity lookup |
| `status` | `/v1/status` — freshness and totals |
| `usage` | per-key usage |
| `calendar` | release calendar |
| `webhooks` | subscription management |
| `account`, `auth`, `billing`, `admin` | dashboard, sign-in, plans, operations |

JSON envelope `{success, data, meta}`; CSV via `format=csv`; transforms
`yoy|mom|pct_change|3ma|index`. Redis handles rate limiting, response caching and sessions.

**Production read API** — `cloudflare/api/src/index.ts` (Cloudflare Worker + D1) mirrors
the public catalog, series, status, market, regional, funds, DAM and calendar endpoints.
Auth/billing/dashboard write endpoints still live in FastAPI. The Worker is the only API
the public site calls; the D1 schema is `cloudflare/api/schema.sql`.

**Auth** — `X-API-Key` for the API; server-side sessions for the dashboard. Plans
Free/Developer/Pro/Business differ by quota, history depth, vintages, webhooks and display
rights.

## Ingestion

`IngestionJob` (`framework.py`) handles the common path. Jobs implement `fetch()` and
`parse()`. Helpers:

- `http_client.py` — curl_cffi browser impersonation, 429/403 retry, optional proxy/relay,
  per-host TLS verification exceptions for incomplete government certificate chains.
- `browser_fetch.py` — Playwright + installed Chrome for F5-protected file paths.
- `bb_tables.py` — declarative parser for Bangladesh Bank's wide statistical workbooks.
- `storage.py` — local archive + R2 mirror + `source_documents` index.
- `joblock.py` — Redis single-flight lock.
- `alerting.py` — Resend email + optional webhook.

## Frontend

TanStack Start (React 19, SSR) + Vite + Tailwind v4 + shadcn + Recharts, built for Cloudflare
Workers. `src/lib/bangladata/client.server.ts` holds the site API key server-side; without
`BANGLADATA_API_BASE` the site renders fixtures.

Pages: landing, `/data/{module}`, `/series/{id}`, `/market`, `/districts`,
`/districts/{slug}`, `/topics`, `/topics/{slug}`, `/derived`, `/coverage`, `/calendar`,
`/docs`, `/pricing`, `/status`, dashboard, admin and legal pages.

## Delivery

CI runs backend lint/tests, schema idempotency, frontend lint/typecheck/build, a repo
consistency check, a workflow lint and a secret scan. Deploys are:

- **API**: `cd cloudflare/api && npx wrangler deploy` (D1 binding + cron trigger).
- **Website**: `cd frontend && npm run build`, then `npx wrangler deploy` from
  `frontend/.output/server`.
- **Ingestion**: the `Ingest` GitHub Actions workflow (daily + `workflow_dispatch`) restores
  the R2 Postgres snapshot, runs the Python jobs, uploads the new snapshot, and syncs D1.

`docs/cloudflare.md` is the deployment map. The legacy VPS path
(`ops/deploy/deploy_from_pc.sh vps`) remains available for a persistent Postgres.
