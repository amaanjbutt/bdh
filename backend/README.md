# backend/

Python 3.12. One Docker image (`Dockerfile`, build context = this folder) runs both the API
(`uvicorn app.main:app`) and the scheduler (`python -m ingestion.scheduler`). Inside the
container the code lives at `/app`, so modules are `app.*`, `ingestion.*`, `db.*`, `scripts.*`.

```
app/            FastAPI
  main.py         app + middleware + router list
  api/            catalog, series, market, regional, status, usage, search, calendar,
                  webhooks, account, auth, billing, admin
  services/       series_repo.py (series/catalog SQL), cache.py (Redis JSON cache), transforms.py,
                  reqlog.py (request log), search.py, webhook_delivery.py, email.py, metrics.py
  security.py     API-key + session auth, plans, rate limiting, history floor
  billing/        LemonSqueezy client + webhook handling
  config.py       settings from env
ingestion/
  framework.py    IngestionJob base: fetch -> archive -> parse -> validate -> upsert -> run row
  jobs/           one module per job (docstring = source, quirks, ids)
  registry.py     JOBS - every job, imported by the CLI and the scheduler
  schedule.py     SCHEDULES (VPS cron, Asia/Dhaka)
  scheduler.py    APScheduler service + staleness / stuck-run checks + housekeeping
  run.py          CLI: python -m ingestion.run <job> [--backfill] [--force] | --list
  http_client.py  curl_cffi browser-TLS client (429/403 retry)
  bb_tables.py    Bangladesh Bank wide-workbook parser + catalog
  browser_fetch.py Playwright + installed Chrome for F5-protected files
  storage.py      local archive + optional R2 mirror + source_documents index
  search_entities.py  nightly search index of districts
db/
  schema.sql      idempotent DDL (CREATE IF NOT EXISTS / ALTER IF NOT EXISTS) - safe to re-run
  init.py         LOCAL bootstrap: schema + seeds + calendar
scripts/        operator tools - see scripts/README.md
tests/          pytest; fixtures are real publisher files
```

## Tests

Need Postgres + Redis. Locally:

```bash
docker compose up -d db redis
docker compose run --rm --no-deps -v "$PWD/backend:/app" api python -m db.init
docker compose run --rm --no-deps -v "$PWD/backend:/app" api python -m pytest -q -o addopts='' -rfE
```

CI runs the same suite against fresh Postgres/Redis service containers, plus `ruff check`,
schema idempotency (apply `schema.sql` twice) and `python -m scripts.check_repo`.

## Conventions

- New endpoint: router in `app/api/`, SQL in `services/series_repo.py` (or the router for
  dedicated tables), cache hot public reads with `cache.cached_json`, document it in
  `frontend/content/docs/`, add a test.
- New job: checklist in `docs/ingestion.md`. Upserts go through `framework.upsert` (batched,
  skips unchanged, one value per point). Raise when every fetch fails.
- Schema change: add idempotent DDL to `db/schema.sql`; apply on prod with psql after a
  backup (the deploy does not migrate).
- Dependencies: `requirements.txt` holds exact pins. Bump deliberately and run the suite.
