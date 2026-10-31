# Rules

These are the invariants that keep the product trustworthy. They are not suggestions.

## 1. Secrets live in `secrets.md` only

Never put a credential in `backend/`, `frontend/public/`, `ops/`, docs, commit messages or
logs. `.env` is gitignored. The gitleaks scan in CI checks the full history.

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

Never hand-write `first_seen_at` or rows in `observation_revisions`. The trigger and
`scripts/vintages_core.py` own them.

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
