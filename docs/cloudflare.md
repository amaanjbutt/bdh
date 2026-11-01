# Cloudflare deployment

The public product now runs on Cloudflare. The heavy Python parsers still run on
GitHub Actions; no VPS is required.

| Piece | Where | URL / binding |
|---|---|---|
| Website | Cloudflare Worker `bangladatahub` | <https://bangladatahub.amaanjbutt.workers.dev> |
| Public API | Cloudflare Worker `bangladatahub-api` | <https://bangladatahub-api.amaanjbutt.workers.dev> |
| Serving database | D1 `bangladatahub` (APAC) | binding `DB` |
| Raw archive + Postgres snapshot | R2 `bangladeshdatahub-raw` | `postgres/latest.dump` |
| Heavy ingestion | GitHub Actions `Ingest` workflow | `.github/workflows/ingest.yml` |
| Schedule / stale check | Cloudflare Cron Trigger | `*/30 * * * *` |

## Why the split

Cloudflare Workers cannot run this ingestion stack as-is:

- the jobs use `pdfplumber`, `openpyxl`, `pandas`, `psycopg`, Tesseract and a
  browser TLS client;
- PDF/Excel parsing can take minutes and hundreds of MB;
- Workers have a 30s CPU limit (paid) and 128 MB memory;
- D1 is SQLite, not Postgres — the Python jobs use JSONB, PL/pgSQL triggers and
  Postgres upserts.

So Cloudflare owns the always-on read layer, D1 and the schedule; GitHub Actions
owns the Python runtime. The user-facing result is still "everything on
Cloudflare" for the API and website.

## Request path

```
browser
  -> bangladatahub (Worker, TanStack Start SSR)
       -> service binding API
            -> D1 (series, observations, market, funds, DAM)
            -> R2 (raw archive)
```

The frontend uses a **service binding**, not a public `fetch`, because
Worker-to-Worker requests on the same `workers.dev` zone are blocked with
Cloudflare error 1042. `frontend/src/lib/bangladata/client.server.ts` calls
`env.API.fetch(...)`; the public `BANGLADATA_API_BASE` is only used outside
Workers (local dev, scripts).

## Ingestion path

```
GitHub Actions (daily 01:30 UTC / 07:30 BST)
  -> restore s3://bangladeshdatahub-raw/postgres/latest.dump
  -> run Python ingestion jobs
  -> dump Postgres back to R2
  -> scripts.sync_d1 posts changed rows to /admin/sync
       -> D1 upsert + revision trigger
```

The Postgres service container is ephemeral. R2 is the durable state. If a
persistent Postgres is preferred, set the `DATABASE_URL` repository secret and
the workflow skips the restore/dump steps.

`sync_d1` sends only rows changed since the Worker's `last_sync` watermark,
then advances the watermark only after every batch succeeds.

## Deploy

```bash
# API Worker (D1 binding + cron)
cd cloudflare/api
npx wrangler deploy

# Website
cd frontend
npm run build
cd .output/server
npx wrangler deploy \
  --var BANGLADATA_API_BASE:https://bangladatahub-api.amaanjbutt.workers.dev \
  --var BANGLADATA_PUBLIC_API_BASE:https://bangladatahub-api.amaanjbutt.workers.dev
```

Secrets (set once, never committed):

```bash
cd cloudflare/api
npx wrangler secret put SYNC_TOKEN          # value in secrets.md
npx wrangler secret put GITHUB_TOKEN        # optional: enables cron dispatch
```

The frontend needs `BANGLADATA_API_KEY` as a Worker secret (the site's server-side
key). The API base/public base are ordinary Worker vars.

## D1 schema and seed

```bash
# schema
cd cloudflare/api
npx wrangler d1 execute bangladatahub --remote --file=schema.sql

# snapshot export (from the canonical Postgres)
cd backend
DATABASE_URL=... python -m scripts.export_d1
# apply cloudflare/api/seed/*.sql in name order with wrangler d1 execute
```

`backend/scripts/export_d1.py` writes chunked `INSERT OR REPLACE` files (1,000
rows each) so no single D1 request is too large. The seed directory is
gitignored.

## Auth and accounts

The Worker implements the free-tier self-serve flow on D1:

- `POST /auth/signup`, `/auth/login`, `/auth/logout`, `/auth/change-password`
- `GET/PATCH /v1/account`, `GET/POST /v1/keys`, `DELETE /v1/keys/{id}`
- `GET /v1/usage`, `/v1/usage/history`, `/v1/usage/endpoints` (usage counters are
  zero until request logging is added)

Passwords use PBKDF2-SHA256 at **100,000 iterations**, which is Cloudflare
WebCrypto's cap. Python's verifier accepts both 100k and older 200k hashes; the
Worker can only verify 100k, so a pre-existing 200k dashboard password needs a
reset. API-key auth is unaffected.

Not ported yet: paid checkout/billing portal, Google OAuth, webhooks delivery,
and Redis-backed rate limiting. `/auth/google/config` returns `{enabled:false}`;
billing/webhook mutations return a clear 501.

## Cron Trigger

The API Worker runs every 30 minutes. It checks the latest observation date; if
data is more than two days old **and** `GITHUB_TOKEN` is configured, it calls
GitHub's `workflow_dispatch` for `ingest.yml`. GitHub's own daily schedule is the
primary trigger; the Worker cron is the backup/watchdog.

## Custom domain

`bangladatahub.com` is not in this Cloudflare account yet. Add the zone, then
attach:

- `bangladatahub.com/*` → Worker `bangladatahub`
- `api.bangladatahub.com/*` → Worker `bangladatahub-api`

After that, update `BANGLADATA_API_BASE` / `BANGLADATA_PUBLIC_API_BASE` and the
frontend's `publicApiBase()` fallback to `https://api.bangladatahub.com`.
