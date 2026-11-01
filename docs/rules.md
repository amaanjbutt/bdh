# Rules

These are the invariants that keep the product trustworthy. They are not suggestions.

## 1. Secrets live in `secrets.md` only

Never put a credential in `backend/`, `frontend/public/`, `ops/`, `cloudflare/`, docs, commit
messages or logs. `.env` is gitignored. The gitleaks scan in CI checks the full history.
Worker secrets go through `wrangler secret put`; `wrangler.jsonc` holds only non-secret vars.

## 2. Production data: back up, then change

Before any `UPDATE`/`DELETE` on production, take a backup or copy the table. Never run
`db.init` on production without a backup. Never `redis-cli FLUSHDB` on production.

## 3. Settle suspect data at the source

Confirm against the publisher before calling a value wrong. If the publisher confirms an
odd value, keep it and annotate it in `observation_notes`. Do not "fix" official numbers to
make a chart look plausible.

## 4. One writer per point

Every upsert writes one value per `(series, date, dims)` and uses
`WHERE value IS DISTINCT FROM EXCLUDED.value`. A multi-file job reads oldest → newest so
the newest file wins.

## 5. A fetch that fails everywhere must fail the run

Returning `[]` reads as "no new data" and hides a broken source. Raise instead; the run is
marked `failed` and the staleness alert fires.

## 6. Vintages are owned by the database

Never hand-write `first_seen_at` or rows in `observation_revisions`. The Postgres trigger,
the D1 trigger and `scripts/vintages_core.py` own them. `adminSync` writes observations
through the D1 trigger; do not bypass it with a raw value update.

## 7. Counts are never typed by hand

Use `LIVE_COUNTS`, `counts.ts` or the build script tokens (`{{SERIES_COUNT}}`,
`{{MODULE_COUNT:...}}`). A hard-coded "2,500 series" will drift.

## 8. Generated files are generated

`frontend/public/{docs,llms*.txt,AGENTS.md,changelog.xml}` and the sitemaps come from
`frontend/scripts/build-llms.mjs`; edit `frontend/content/`, not the generated copies.

## 9. Every new job needs a home and a test

Register it in `ingestion/registry.py`, schedule it in `ingestion/schedule.py` (or list it
in `MONITORED_EXTERNAL`/`WORKSTATION`), add a parser test with a real fixture, and describe
it in `docs/ingestion.md`. `python -m scripts.check_repo` enforces the first three.

## 10. Readable names come from the catalog

Raw publisher text stays in `series.description` or `dims`. Display names, units and
frequency are normalised in the catalog; do not repeat publisher boilerplate in the UI.

## 11. Units and dates are explicit

Every series has a unit (`percent`, `bdt_bn`, `usd_mn`, `count`, `index`, ...) and a
frequency. Dates are the period end (month end for monthly, 30 June for a fiscal year,
census date for census). Never store a monthly value on the first of the month unless the
publisher does.

## 12. No silent scope changes

Removing a dataset, changing a series id or changing a unit is a breaking API change.
Announce it in `frontend/content/docs/changelog.md` and keep the old id as an alias or
canonical redirect where possible.

## 13. Website → API uses the service binding

Same-zone Worker-to-Worker `fetch` is blocked with Cloudflare error 1042. Keep the `API`
service binding in `frontend/wrangler.jsonc` and call `env.API.fetch(...)` from
`client.server.ts`. Keep `nodejs_compat_populate_process_env` or `process.env` is empty and
the site silently renders fixtures.

## 14. D1 batches are parameter-bounded

D1 allows 100 bound parameters per statement/batch. `adminSync` flushes 5 statements at a
time (widest row 18 columns = 90 params). Do not raise the batch size without checking the
widest INSERT.

## 15. D1 writes are resumable, not guaranteed

D1 free allows 100k rows written/day. `sync_d1` must stop cleanly on
`free tier daily row write limit`, leave the watermark unchanged, and exit successfully so
the next run resumes. Never advance the watermark before every batch succeeds.

## 16. The R2 series mirror is generated

`series/<id>.json` and `series/_index.json` come from `scripts/export_r2_series.py`. Do not
hand-edit or hand-upload them; rerun the exporter after a data change.

## 17. Cloudflare deploy order is API, then site

Deploy `bangladatahub-api` first when the API contract or D1 schema changes, then rebuild and
deploy `bangladatahub`. The site's service binding points at the deployed API by name, but a
new endpoint or column must exist before the site calls it.
