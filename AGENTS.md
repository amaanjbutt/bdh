# AGENTS.md — start here

**BanglaDataHub** is a self-serve REST API and website for Bangladesh's official economic
and financial data (Bangladesh Bank, BBS, NBR, EPB, DSE): time series,
DSE listed instruments, Census 2022 districts, trade receipts, digital payments, revision
vintages and a labelled derived layer.

Live targets: **bangladatahub.com** (website, Cloudflare Workers) and
**api.bangladatahub.com** (FastAPI on a VPS).

This file is the map. Read it fully, then open only the doc that answers your question.

## Repo map

| Path | What it is |
|---|---|
| `backend/app/` | FastAPI app — routers in `api/`, data access in `services/series_repo.py`, auth + plans in `security.py`, billing in `billing/` |
| `backend/ingestion/` | Framework (`framework.py`), jobs in `jobs/`, `registry.py`, `schedule.py`, `scheduler.py`, source parsers (`bb_tables.py`), storage (`storage.py` → local + R2) |
| `backend/db/` | `schema.sql` (idempotent DDL), `init.py` (catalog seed) |
| `backend/scripts/` | Operator tools (`build_bb_catalog.py`, backups, catalog checks) |
| `backend/tests/` | pytest suite for parsers, catalog and API primitives |
| `frontend/` | TanStack Start (SSR) site on Cloudflare Workers — `src/routes/`, `src/lib/bangladata/`, markdown CMS in `content/` |
| `ops/` | deploy scripts, Caddy config, Cloudflare relay, ingestion workflows, SEO scripts |
| `docs/` | internal docs: architecture, ingestion, operations, data quality, rules |
| `secrets.md` | production credentials (private repo only) |

## Where things run

| Piece | Runs on | Deployed by |
|---|---|---|
| Website | Cloudflare Worker `bangladatahub` | `wrangler deploy` from `frontend/.output/server` |
| Public API | Cloudflare Worker `bangladatahub-api` + D1 | `wrangler deploy` from `cloudflare/api` |
| Heavy ingestion (PDF/Excel/OCR) | GitHub Actions `Ingest` workflow | `.github/workflows/ingest.yml` |
| Durable ingestion state | R2 `postgres/latest.dump` | the workflow uploads after each run |
| Schedule / stale watchdog | Cloudflare Cron Trigger on the API Worker | `cloudflare/api/wrangler.jsonc` |
| Browser-only downloads (BB F5-protected files) | a workstation or a runner with Chrome, via `ingestion/browser_fetch.py` | manual / GHA |

No VPS is required. `docs/cloudflare.md` is the deployment map; `docs/operations.md`
keeps the legacy VPS path as an alternative.

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
```

## Rules that are never broken

1. **Secrets live in `secrets.md` only.** Never put a credential in `backend/`, `frontend/public/`,
   `ops/gha-ingest/`, docs, commit messages or logs.
2. **Prod data: back up, then change.** Backup table / copy-then-swap before any UPDATE/DELETE;
   never run `db.init` on prod; never `redis-cli FLUSHDB`.
3. **Settle suspect data at the source.** Confirm against the publisher before calling a value
   wrong; keep confirmed-but-odd official values and annotate them in `observation_notes`.
4. **One writer per point.** Upserts write one value per `(series, date, dims)` with
   `WHERE value IS DISTINCT FROM EXCLUDED.value`; multi-file jobs read oldest → newest.
5. **A fetch that fails everywhere must fail the run.** Returning `[]` reads as healthy.
6. **Vintages:** never hand-write `first_seen_at` / `observation_revisions`; the trigger and
   `scripts/vintages_core.py` own them.
7. **Counts are never typed by hand.** Use `LIVE_COUNTS` / `counts.ts` / the build script tokens.
8. **Generated files are generated:** `frontend/public/{docs,llms*.txt,AGENTS.md,changelog.xml}`
   and sitemaps come from `frontend/scripts/build-llms.mjs`; edit `frontend/content/`.
9. **Every new job** → `registry.py` + `schedule.py` + a test with a real fixture.
10. **Readable names come from the catalog.** Raw publisher text stays in `description` or dims.

## Find it fast

| Question | Look in |
|---|---|
| What is the product, plans, audience? | `docs/product.md` |
| How does a request / ingestion run flow? Which tables exist? | `docs/architecture.md`, `backend/db/schema.sql` |
| Which job feeds series X / runs where / when? | `docs/ingestion.md`, `backend/ingestion/jobs/<job>.py` |
| An endpoint's behaviour and params | `frontend/content/docs/api-*.md`, router in `backend/app/api/` |
| A dataset's coverage and quirks | `frontend/content/docs/data-*.md` |
| Deploy, verify prod, handle an incident | `docs/operations.md` |
| Data-quality process | `docs/data-quality.md` |
| Why something is the way it is | `docs/decisions.md` |
| What is still open | `docs/backlog.md` |
