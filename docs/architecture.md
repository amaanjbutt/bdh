# Architecture

## System map

```
              publishers (Bangladesh Bank, BBS, NBR, EPB, DSE)
                 │                 │                 │
     F5/WAF      │                 │ HTML / JSON /   │ XLSX
     challenge   │                 │ XLSX            │
                 ▼                 ▼                 ▼
        browser_fetch         VPS scheduler      manual backfill
        (Chrome, workstation) (APScheduler)      (same job, --backfill)
                 │                 │                 │
                 └────────────────►│◄────────────────┘
                                   ▼
                  ┌──────────────────────────────────┐
                  │ VPS /opt/bangladata              │
                  │ Postgres 16 · Redis · FastAPI    │
                  │ scheduler · backup · Caddy       │
                  └──────────────────────────────────┘
                                   ▲ HTTPS (X-API-Key)
                  Cloudflare Workers (bangladatahub.com)
                  TanStack Start SSR · edge cache · bot renderer
```

- **One VPS** runs the API, Postgres, Redis, scheduler, nightly backups and Caddy.
- **Raw archive** is written to a local Docker volume and mirrored to Cloudflare R2 when
  configured. `source_documents` records the SHA-256, source URL, content type and object key.
- **Ingestion** is a Python framework: fetch → archive → parse → validate → upsert → run
  row → alert → webhooks (incremental only).

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
consistency check and a secret scan. Deploys run from the owner's PC:
`ops/deploy/deploy_from_pc.sh vps` rebuilds and health-checks the API; `web` builds and
deploys the Worker.
