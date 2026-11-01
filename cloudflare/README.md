# cloudflare/

The Cloudflare half of BanglaDataHub. Read [`../docs/cloudflare.md`](../docs/cloudflare.md)
for the architecture and [`../docs/cloudflare-runbook.md`](../docs/cloudflare-runbook.md)
for operations.

## What is here

| Path | What |
|---|---|
| `api/src/index.ts` | The whole public API Worker: router, D1 queries, auth/sessions/keys, admin sync, cron |
| `api/schema.sql` | D1 (SQLite) schema — fresh installs |
| `api/migrations/` | Incremental D1 migrations (`0002_auth.sql` added sessions/signup throttle/password columns) |
| `api/wrangler.jsonc` | Worker name, D1 binding, cron trigger, non-secret vars |
| `api/.wrangler/` | Local Wrangler cache (gitignored) |

Generated D1 seed SQL is **not** kept here. `backend/scripts/export_d1.py` writes it to
`backend/data/d1/` (gitignored), and it is applied with `wrangler d1 execute`.

## Deployed resources

| Thing | Value |
|---|---|
| API Worker | `bangladatahub-api` |
| Website Worker | `bangladatahub` |
| API URL | <https://bangladatahub-api.amaanjbutt.workers.dev> |
| Website URL | <https://bangladatahub.amaanjbutt.workers.dev> |
| D1 database | `bangladatahub` / `2de61d47-c067-4d35-83de-a88d05774eae` |
| R2 bucket | `bangladeshdatahub-raw` |
| Cron | `*/30 * * * *` |
| Ingestion workflow | `.github/workflows/ingest.yml` |

## `api/src/index.ts` map

The Worker is one file on purpose: Wrangler deploys it without a bundler step and there is
no shared runtime with the Python backend. Search for these section banners/functions:

| Area | Functions |
|---|---|
| Response/HTTP helpers | `json`, `fail`, `HttpError`, `iso`, `today` |
| Auth + plans | `authenticate`, `sha256Hex`, `PLAN_HISTORY`, `historyFloor` |
| Accounts/keys | `hashPassword`, `verifyPassword`, `createSession`, `authenticateSessionOrKey`, `signup`, `login`, `logout`, `changePassword`, `account`, `keys`, `usage` |
| Transforms | `applyTransform`, `transformedUnit`, `pct`, `shiftYear`, `shiftMonth` |
| Catalog/status | `meta`, `freshness`, `catalogList`, `status` |
| Search | `search` |
| Series | `seriesById`, `seriesData`, `latest`, `revisions`, `asOfVintage`, `notesFor` |
| Market | `marketOverview`, `marketSecurities`, `marketPrices` |
| Regional | `regionalDistricts`, `regionalDistrict` |
| Funds | `fundsRegistry`, `fundsAmcs`, `fundsNav` |
| DAM | `dam`, `damDates` |
| Calendar | `calendar`, `calendarIcs` |
| Admin | `adminSync`, `adminState`, `adminDispatch`, `dispatchIfStale` |
| Router | `export default { fetch, scheduled }` |

## Deploy

```bash
cd cloudflare/api
npx wrangler deploy
```

Secrets live on the Worker, not in `wrangler.jsonc`:

```bash
npx wrangler secret put SYNC_TOKEN       # /admin/sync and /admin/state
npx wrangler secret put GITHUB_TOKEN     # optional: cron dispatch to ingest.yml
```

## D1

```bash
# fresh schema
npx wrangler d1 execute bangladatahub --remote --file=schema.sql

# incremental migrations (run once each)
npx wrangler d1 execute bangladatahub --remote --file=migrations/0002_auth.sql

# seed from Postgres
cd ../../backend
python -m scripts.export_d1
# apply backend/data/d1/*.sql in name order with wrangler d1 execute
```

## Gotchas

- Worker-to-worker `fetch` on the same `*.workers.dev` zone returns **error 1042**; the
  frontend uses the `API` service binding instead.
- D1 free tier: **100,000 rows written/day**, 5M read/day, 5GB. See the runbook for the
  resumable sync and the exact error.
- D1 batches allow **100 bound parameters per statement/batch**; `adminSync` flushes 5
  statements at a time (max 90 params).
- Cloudflare WebCrypto caps PBKDF2 at **100,000 iterations**; Python hashes at 100k too now.
- The public `BANGLADATA_API_BASE` is only for local dev/scripts. The site calls the API
  through `env.API`.
