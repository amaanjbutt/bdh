# AGENTS.md — start here

**BanglaDataHub** is a self-serve REST API and website for Bangladesh's official economic,
financial and market data: Bangladesh Bank, BBS, NBR, EPB, DSE and 21 asset managers.
It includes time series, DSE instruments, Census 2022 districts, trade receipts, digital
payments, revision vintages, mutual-fund NAVs and a labelled derived layer.

**Live now**

- Website: <https://bangladatahub.amaanjbutt.workers.dev>
- API: <https://bangladatahub-api.amaanjbutt.workers.dev>
- Custom domains `bangladatahub.com` / `api.bangladatahub.com` are **not attached yet**
  (the zone is not in the Cloudflare account). See `docs/cloudflare.md`.

This file is the map. Read it fully, then open only the doc that answers your question.
Do not load the whole `docs/` tree; use the task table below.

## Read only what you need

| Task | Open |
|---|---|
| Deploy / operate the Cloudflare API, D1, cron | `docs/cloudflare.md`, `docs/cloudflare-runbook.md` |
| Change the website or its API wiring | `frontend/README.md`, `frontend/src/lib/bangladata/client.server.ts` |
| Add/fix an ingestion job | `docs/ingestion.md`, `backend/ingestion/framework.py`, `registry.py`, `schedule.py` |
| Add an asset-manager NAV adapter | `backend/ingestion/jobs/amc_nav.py`, `frontend/content/docs/data-funds.md` |
| Change the D1 schema or sync | `cloudflare/api/schema.sql`, `backend/scripts/export_d1.py`, `sync_d1.py` |
| Change the public API contract | `cloudflare/api/src/index.ts`, `frontend/content/docs/api-reference.md` |
| Investigate a suspicious value | `docs/data-quality.md`, the series page, the source document |
| Understand a past deployment failure | `docs/history/2026-11-01-cloudflare-deployment.md` |
| Know why something is the way it is | `docs/decisions.md` |
| See what is still open | `docs/backlog.md` |
| Product, plans, audience | `docs/product.md` |
| All hard rules | `docs/rules.md` |

## Repo map

| Path | What it is |
|---|---|
| `cloudflare/` | **Live** API Worker (`api/src/index.ts`), D1 schema/migrations, Wrangler config, cron, admin sync |
| `backend/app/` | FastAPI reference/local API — routers, `services/series_repo.py`, auth/plans, billing |
| `backend/ingestion/` | Python ingestion framework, 17 jobs, registry/schedule, BB parsers, storage (local + R2) |
| `backend/db/` | Postgres `schema.sql` (canonical writer schema) and `init.py` catalog seed |
| `backend/scripts/` | Operator tools: `export_d1.py`, `sync_d1.py`, `r2_snapshot.py`, `export_r2_series.py`, backups, checks |
| `backend/tests/` | Pytest suite for parsers, catalog and API primitives |
| `frontend/` | TanStack Start SSR on Cloudflare Workers — routes, `src/lib/bangladata/`, markdown CMS |
| `ops/` | Legacy VPS/Caddy deploy scripts, relay Worker, SEO scripts |
| `docs/` | Internal docs; start at `docs/README.md` |
| `.github/workflows/` | `ci.yml` (tests/lint/build/secret scan) and `ingest.yml` (heavy Python jobs) |
| `secrets.md` | Production credentials (private, gitignored) |

## Where things run

| Piece | Runs on | Deployed by |
|---|---|---|
| Website | Cloudflare Worker `bangladatahub` | `wrangler deploy` from `frontend/.output/server` |
| Public API | Cloudflare Worker `bangladatahub-api` + D1 | `wrangler deploy` from `cloudflare/api` |
| Serving DB | D1 `bangladatahub` (APAC) | `cloudflare/api/schema.sql` + migrations + `export_d1.py` |
| Heavy ingestion | GitHub Actions `Ingest` workflow | `.github/workflows/ingest.yml` |
| Durable ingestion state | R2 `postgres/latest.dump` | workflow uploads after each run |
| Per-series flat files | R2 `series/<id>.json` | `backend/scripts/export_r2_series.py` |
| Schedule / stale watchdog | Cloudflare Cron `*/30 * * * *` | `cloudflare/api/wrangler.jsonc` |
| Browser-only downloads | workstation/runner with Chrome | manual / GHA |

No VPS is required. The VPS path in `docs/operations.md` is kept as an alternative for a
persistent Postgres or browser-based ingestion.

## Commands

```bash
docker compose up -d db redis                      # local Postgres + Redis
docker compose build api
docker compose run --rm --no-deps -v "$PWD/backend:/app" api python -m pytest -q -o addopts='' -rfE
docker compose run --rm --no-deps -v "$PWD/backend:/app" api python -m db.init
docker compose exec api python -m ingestion.run --list
docker compose exec api python -m ingestion.run <job> --force

cd frontend && npm ci && npm run dev               # http://localhost:8080
cd frontend && npm run lint && npm run typecheck && npm run build

cd cloudflare/api && npx wrangler deploy           # API Worker + D1 + cron
cd frontend && npm run build && cd .output/server && npx wrangler deploy \
  --var BANGLADATA_API_BASE:https://bangladatahub-api.amaanjbutt.workers.dev \
  --var BANGLADATA_PUBLIC_API_BASE:https://bangladatahub-api.amaanjbutt.workers.dev

gh workflow run ingest.yml --repo amaanjbutt/bdh  # full daily ingestion
```

## Rules that are never broken

1. **Secrets live in `secrets.md` only.** Never put a credential in `backend/`,
   `frontend/public/`, `cloudflare/`, docs, commit messages or logs. Worker secrets go
   through `wrangler secret put`, not `wrangler.jsonc` vars.
2. **Prod data: back up, then change.** Backup table / copy-then-swap before any UPDATE/DELETE;
   never run `db.init` on prod; never `redis-cli FLUSHDB`.
3. **Settle suspect data at the source.** Confirm against the publisher before calling a value
   wrong; keep confirmed-but-odd official values and annotate them in `observation_notes`.
4. **One writer per point.** Upserts write one value per `(series, date, dims)` with
   `WHERE value IS DISTINCT FROM EXCLUDED.value`; multi-file jobs read oldest → newest.
5. **A fetch that fails everywhere must fail the run.** Returning `[]` reads as healthy.
6. **Vintages:** never hand-write `first_seen_at` / `observation_revisions`; the Postgres
   trigger, the D1 trigger and `scripts/vintages_core.py` own them.
7. **Counts are never typed by hand.** Use `LIVE_COUNTS` / `counts.ts` / the build script tokens.
8. **Generated files are generated:** `frontend/public/{docs,llms*.txt,AGENTS.md,changelog.xml}`
   and sitemaps come from `frontend/scripts/build-llms.mjs`; edit `frontend/content/`.
9. **Every new job** → `registry.py` + `schedule.py` + a test with a real fixture.
10. **Readable names come from the catalog.** Raw publisher text stays in `description` or dims.
11. **Site → API uses the `API` service binding.** Same-zone Worker-to-Worker `fetch` returns
    Cloudflare error 1042. Keep `nodejs_compat_populate_process_env` or the site silently
    renders fixtures.
12. **D1 writes are parameter-bounded.** `adminSync` flushes 5 statements at a time (max 90
    bound params). Do not raise it without checking the widest row (18 columns).
13. **D1 free tier is 100k rows written/day**, 5M read/day, 5GB — not unlimited. The sync is
    resumable and must leave the watermark unchanged when the cap is hit.
14. **The R2 series mirror is generated.** Do not hand-edit `series/<id>.json`; rerun
    `export_r2_series.py`.

## Docs maintenance

When a change alters behaviour, update the doc in the same commit. Keep `AGENTS.md` a map,
not a manual: deep procedures go in `docs/cloudflare-runbook.md`, architecture in
`docs/cloudflare.md`, and one dated record per migration/incident in `docs/history/`.
