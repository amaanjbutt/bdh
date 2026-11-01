# 2026-11-01 — Cloudflare deployment build log

Status: **live on `*.amaanjbutt.workers.dev`; custom domain pending.**
This is the dated record of what was deployed, why, and the exact failures that shaped the
final architecture. It is intentionally detailed; the short version is in
[`../cloudflare.md`](../cloudflare.md) and the commands are in
[`../cloudflare-runbook.md`](../cloudflare-runbook.md).

## Starting point

Before this work:

- FastAPI API + Postgres 16 + Redis + scheduler ran on a VPS (`docs/operations.md`).
- The website was TanStack Start on Cloudflare Workers, but had not been deployed.
- Ingestion was 17 Python jobs: BB HTML/workbooks, BBS CPI/GDP/census, BTRC, NBR, BPDB,
  DAM, BSEC registry, ICB NAV, 20 other AMC NAV adapters, DSE, EPB and TCB.
- Catalog: 3,596 series / 118,991 observations; 18 AMCs originally, then 21 after the
  CWT/Prime/CandleStone/other adapters (the NAV work is in the prior commits).
- R2 was enabled for raw archives; `bangladeshdatahub-raw` existed.
- D1 did not exist; no API Worker existed; `bangladatahub.com` was not in the Cloudflare
  account (only `pakdatahub.com` and `academyofmartialarts.club`).

## User request

> “can build your entire API and your ingestion scripts directly inside Cloudflare Workers
> … so we can deploy everything on cloudflare. do it.”

Then:

> “we can do the ingestion runners from github actions if theyre heavy”

and later:

> “what about this” — comparing R2 flat files (Option A) vs D1 (Option B).

The final request was to document everything and organize the repo so an AI agent can
navigate it without loading large amounts of context.

## Architecture chosen

```
browser
  -> Cloudflare Worker `bangladatahub` (TanStack Start SSR)
       -> service binding `API`
            -> Cloudflare Worker `bangladatahub-api`
                 -> D1 `bangladatahub`
                 -> R2 `bangladeshdatahub-raw`

GitHub Actions `Ingest` workflow
  -> restore Postgres snapshot from R2
  -> run Python ingestion jobs
  -> dump Postgres back to R2
  -> export per-series JSON to R2
  -> sync changed rows to D1 via /admin/sync
```

Why the split:

- Workers cannot run `pdfplumber`, `openpyxl`, `pandas`, `psycopg`, Tesseract, Chrome or
  browser-TLS impersonation. The Python ingestion is minutes-long and memory-heavy.
- D1 is SQLite, not Postgres. The ingestion framework uses JSONB, PL/pgSQL triggers and
  Postgres upserts. Porting the whole writer would be a rewrite.
- Cloudflare still owns the always-on read API, auth, website, schedule and storage.
  GitHub Actions owns only the heavy Python runtime.

## Timeline

### 1. Account and credential check

`npx wrangler whoami` showed an OAuth login with:

- Workers write, D1 write, KV write, routes write, scripts write, zone read.
- Account `Amaanjbutt@gmail.com's Account`, ID `10a52611d4c80a5308132395489e51f1`.
- Workers.dev subdomain `amaanjbutt`.

The zone list had only `pakdatahub.com` and `academyofmartialarts.club`. `bangladatahub.com`
was **not** in the account, so custom-domain routing was impossible. The deployment uses
`*.amaanjbutt.workers.dev` until the zone is added.

Existing Workers: `ama`, `pakdata-relay`, `pakdatahub`, `pypsx-legal-review`. No
`bangladatahub` or API Worker. No D1 databases.

### 2. D1 schema and seed

Created:

- Database `bangladatahub`
- ID `2de61d47-c067-4d35-83de-a88d05774eae`
- Region APAC
- `cloudflare/api/schema.sql` (SQLite; 36 statements, 70 rows written for the schema)

Then:

- Wrote `backend/scripts/export_d1.py` to generate chunked `INSERT OR REPLACE` SQL from
  Postgres.
- First run: **135 files / 124,702 rows** (series, observations, revisions, funds, DAM,
  DSE, calendar, auctions, runs, users, keys).
- Applied every file with `wrangler d1 execute --remote`.
- Verified: **3,596 series / 118,991 observations / 356 revisions**, 141 fund-registry
  rows, 269 DAM rows, 632 securities, 632 DSE prices, 25 calendar rows, 9 auctions.

D1 size after seed: ~42 MB.

### 3. API Worker

`cloudflare/api/src/index.ts` implements the public read surface against D1:

- `/health`, `/v1/status`
- `/v1/catalog`, `/v1/catalog/{id}`
- `/v1/search`
- `/v1/series/{id}`, `/latest`, `/revisions` (transforms, CSV, dims, vintages)
- `/v1/market/overview`, `/securities`, `/securities/{code}/prices`
- `/v1/regional/districts`, `/district/{name}`
- `/v1/funds/registry`, `/amcs`, `/nav`
- `/v1/agri/dam`, `/dates`
- `/v1/calendar`, `/calendar.ics`
- `/v1/plans`
- `/admin/sync`, `/admin/state`, `/admin/dispatch`
- `/auth/*` and `/v1/account`, `/v1/keys`, `/v1/usage` (added later)

Deployed as `bangladatahub-api` with:

- D1 binding `DB`
- Cron `*/30 * * * *`
- Vars `PUBLIC_BASE`, `GITHUB_REPO=amaanjbutt/bdh`, `GITHUB_WORKFLOW=ingest.yml`
- Secret `SYNC_TOKEN`

First API checks returned the seeded counts and `fx.rate.usd` = **123.99**.

### 4. Website deployment and the fixture bug

Built the frontend and deployed `bangladatahub` to
`https://bangladatahub.amaanjbutt.workers.dev`.

First render showed **USD/BDT 287.40** and PKR-era fixtures. The API key/base were set as
Worker vars, but `process.env` was empty inside the Worker, so `client.server.ts` silently
fell back to fixtures.

Fixes:

1. Added `"nodejs_compat_populate_process_env"` to `frontend/wrangler.jsonc`.
2. Rebuilt and redeployed; `process.env.BANGLADATA_API_BASE` and
   `BANGLADATA_API_KEY` were then visible.
3. The next fetch failed with Cloudflare **error 1042**: Worker-to-Worker fetch on the same
   `workers.dev` zone is blocked.
4. Added a service binding:
   ```jsonc
   "services": [{ "binding": "API", "service": "bangladatahub-api" }]
   ```
5. Nitro's `createHandler` sets `globalThis.__env__ = env`; the `env` argument passed through
   TanStack Start was empty. `frontend/src/server.ts` now reads
   `globalThis.__env__` and stores it as `globalThis.__BDH_ENV`.
6. `client.server.ts` uses `env.API.fetch(new Request("https://api.internal…"))`, falling back
   to the public base outside Workers.
7. Purged the few edge-cache entries created during testing with a temporary `/__purge`
   endpoint (4 entries), then removed the endpoint.

Final check: homepage **123.99**, series page **123.99**, no **287.4**. Pages verified:
`/`, `/series/fx.rate.usd`, `/status`, `/data/funds`, `/market`, `/districts`, `/coverage`,
`/docs`, `/signup`, `/login`, `/dashboard`.

### 5. GitHub Actions ingestion

Added `.github/workflows/ingest.yml`:

- Daily at `01:30 UTC` (07:30 Asia/Dhaka) + `workflow_dispatch`.
- Starts `postgres:18` and `redis:7` services.
- Restores `s3://bangladeshdatahub-raw/postgres/latest.dump`.
- Runs the selected jobs with `python -m ingestion.run <job> --force`.
- Dumps Postgres and uploads it back to R2.
- Runs `python -m scripts.export_r2_series`.
- Runs `python -m scripts.sync_d1` to push changes to D1.
- Optional `DATABASE_URL` secret skips the snapshot path for a persistent Postgres.

First failure: the runner's `pg_dump` is v17/18 and emitted
`SET transaction_timeout`, which the `postgres:16` service rejected. The failed run then
overwrote the good R2 snapshot with an empty/service dump. Fixes:

- Service changed to `postgres:18`.
- Persist step only runs when the restore step succeeded
  (`steps.restore.outcome == 'success'`), so a failed restore cannot overwrite the snapshot.
- Re-uploaded the good local dump (1,263,728 bytes).

Single-job test (`dam_prices`) succeeded: restore 1,263,728 bytes, 1 row upserted, new
snapshot 1,263,761 bytes, D1 sync sent 3,596 series + 269 DAM rows.

Full 14-job run succeeded in **~8 minutes**:

| Job | Rows |
|---|---:|
| bb_web | 233 |
| bb_workbook | 18,394 |
| bbs_cpi | 489 |
| btrc_telecom | 1,210 |
| nbr_revenue | 36 |
| bpdb_power | 1,020 |
| dam_prices | 1 |
| bsec_funds | 1 |
| icb_nav | 30 |
| amc_nav | 16,399 (LR Global timed out; 19/20 managers) |
| dse_market | 115 |
| epb_exports | 522 |
| tcb_prices | 3,820 |
| derive_indicators | 84 |

The R2 snapshot after the run is **1,298,653 bytes** (12:55:36 UTC).

The workflow default was later expanded to include `bb_payments` and `bbs_gdp` (16 jobs;
`bbs_census` stays a manual one-off).

### 6. D1 limits found by the full run

The D1 sync failed for two independent reasons:

1. **100,000 rows written/day** on the free tier. The 118,991-row seed had already consumed
   the day's budget.
2. **100 bound parameters per statement/batch.** `adminSync` was flushing 50 statements;
   SQLite/D1 rejected it with `too many SQL variables at offset 298`.

Fixes:

- `adminSync` flushes **5 statements** at a time (widest row 18 params → 90).
- `sync_d1.py` sends only series changed since the watermark, not all 3,596 every run.
- `sync_d1.py` catches the free-tier limit, prints a warning, exits 0, and leaves the
  watermark unchanged. The next run resumes after 00:00 UTC.
- The watermark was still **12:46:28 UTC** after the failed full run; the full-run changes
  will sync on the next run.

This is a platform cap, not a data bug. The live API kept serving the seeded data.

### 7. Auth, accounts and keys on D1

Added migration `cloudflare/api/migrations/0002_auth.sql`:

- `users.password_hash`, `users.name`, `users.company`
- `sessions(token_hash, user_id, expires_at, created_at)`
- `signup_ips(ip, day, count)`

Worker endpoints:

- `POST /auth/signup`, `/auth/login`, `/auth/logout`, `/auth/change-password`
- `GET/PATCH /v1/account`
- `GET/POST /v1/keys`, `DELETE /v1/keys/{id}`
- `GET /v1/usage`, `/v1/usage/history`, `/v1/usage/endpoints`
- `GET /v1/webhooks` returns empty; mutations return 501
- `/v1/billing/portal` returns 501

Password hashing:

- Cloudflare WebCrypto rejects PBKDF2 above **100,000 iterations**.
- New Worker hashes use 100k; Python's `_PBKDF2_ITER` was changed from 200k to 100k.
- Python still verifies old 200k hashes (it reads the stored iteration count); the Worker
  cannot, so a pre-existing 200k dashboard password needs a reset. API keys are unaffected.

Verified through the live UI: signup → API key shown once → dashboard (Free plan) → API keys
list → login/logout. Test accounts were deleted afterwards; D1 has 1 user / 1 key.

Also removed the Google sign-in button from `signup.tsx`/`login.tsx` because the edge
deployment does not implement Google OAuth; the old button pointed at the unprovisioned
`api.bangladatahub.com`.

### 8. R2 flat-file mirror

After the Option A/B discussion, added `backend/scripts/export_r2_series.py`:

- `series/<id>.json` — metadata + observations + revisions
- `series/_index.json` — catalog + counts
- **3,596 files / 23.5 MB**
- Daily step in the `Ingest` workflow
- D1 remains the SQL serving layer; R2 is export/backup and a future read path

The full local export ran at 13:40 UTC. It reflects the local Postgres, which predates the
full GitHub Actions run's `bb_workbook` changes; the next Ingest run regenerates it from the
restored R2 snapshot.

## Current state (end of this session)

### Live

- Website: <https://bangladatahub.amaanjbutt.workers.dev>
- API: <https://bangladatahub-api.amaanjbutt.workers.dev>
- D1: 3,596 series / 86 funds / 21 AMCs / 632 securities / 358 revisions
- D1 observations: 118,991 (the seed; the full-run updates await the next sync)
- R2 snapshot: 1,298,653 bytes after the full run
- R2 series mirror: 3,596 files / 23.5 MB
- Cron: `*/30 * * * *` (watchdog dormant until `GITHUB_TOKEN` is set)
- CI: green through `7055d91`

### Not done / blocked

- **Custom domain**: `bangladatahub.com` is not in the Cloudflare account. Add the zone and
  routes (`bangladatahub.com/*` → `bangladatahub`, `api.bangladatahub.com/*` →
  `bangladatahub-api`).
- **D1 free tier**: 100k writes/day. The initial seed consumed it. Upgrade to Workers Paid
  for production headroom; the sync is resumable.
- **Cron dispatch**: set `GITHUB_TOKEN` on the API Worker; GitHub's own daily schedule
  already works.
- **Paid billing / Google OAuth / webhook delivery / Redis-equivalent rate limiting** are
  not ported. Free auth, accounts, keys and usage summary are.
- **API surface gaps**: legacy `/v1/funds`, `/v1/amcs`, `/v1/trade/*`, `/v1/agri/markets`,
  `/v1/securities` are not ported; the live fund endpoints are `/v1/funds/registry`,
  `/v1/funds/amcs`, `/v1/funds/nav`.

## Commits in this deployment

| Commit | What |
|---|---|
| `538e7a7` | NAV adapters for 19 more AMCs |
| `de23d6a` | CWT NAV history adapter |
| `5308e4e` | Cloudflare Workers + D1 + GitHub Actions ingestion |
| `23e1b37` | Postgres 18 runner + snapshot protection |
| `c7f2ff9` | Self-serve auth/sessions/API keys on the Worker |
| `ce82ee7` | D1 batching fix + remove edge-only Google button |
| `6dc1d15` | Document Cloudflare limits and remaining work |
| `7351681` | Per-series R2 flat-file mirror |
| `b41608b` | Cloudflare docs, runbook, agent map, folder cleanup |
| `7055d91` | CI/ingestion workflow map |

## Lessons that should not be relearned

1. Same-zone Worker-to-Worker `fetch` is blocked (1042). Use a service binding.
2. Nitro exposes the real bindings at `globalThis.__env__`; the TanStack `env` argument is
   empty. `nodejs_compat_populate_process_env` is required for `process.env`.
3. D1 is not “free unlimited”: 100k writes/day. Seed and catch-up syncs can exhaust it.
4. D1 batches are parameter-bounded. Five statements is the safe ceiling for this schema.
5. Worker WebCrypto PBKDF2 caps at 100k iterations.
6. `pg_dump`/`pg_restore` versions must match the service. A failed restore must never be
   allowed to upload a replacement snapshot.
7. The frontend's fixture fallback is silent. A wrong currency/value usually means the API
   call failed, not that the data is wrong.
8. Edge cache survives deploys; test with a fresh query string and purge the specific keys
   when a fixture-era page was cached.
