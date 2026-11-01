# Decisions

Short records of choices that are easy to re-litigate later.

## 2026-10-31 — Bangladesh fork of the PakDataHub architecture

We reused the proven FastAPI + Postgres + Redis + TanStack Start architecture and the
ingestion framework, but replaced every Pakistan-specific source, job, catalog entry and
frontend route. The API key prefix is `bd_live_`; the domains are `bangladatahub.com` and
`api.bangladatahub.com`.

## 2026-10-31 — Official publishers only

Bangladesh Bank, BBS, NBR, EPB and DSE are the sources. We do not scrape social media,
news summaries or third-party aggregators. When a publisher's site is unusable
(F5-protected BB workbooks), we keep the historical workbook and use the HTML pages for the
live edge rather than substituting an unofficial source.

## 2026-10-31 — Raw archive local-first, R2 optional

The Cloudflare account did not have R2 enabled at launch. `storage.py` always writes the
local archive and mirrors to R2 when the credentials and bucket exist. This keeps ingestion
working without a hard dependency on R2 and makes enabling it a configuration change.

## 2026-10-31 — Census: district headline, not every union

BBS publishes 64 district workbooks, each with district, upazila, union and village rows.
The product needs one profile per district, so the job stores the district headline row
with `dims={"district", "division"}` and ignores sub-district rows. Storing every union
would multiply the row count without a consumer; it can be added later as a separate
`level=union` dimension.

## 2026-10-31 — Census sheet names are normalised

The workbooks use `C-01`, `C01` and `C_01` for the same table. The parser maps all three to
`c01` and builds ids as `regional.census.c01.*`. The alternative — one parser per spelling
— would silently drop a third of the districts.

## 2026-10-31 — Two header rows, never three

Some census sheets put labels on the administrative-unit header row and data immediately
below. Reading a third row turned data values into column labels (e.g. `hindu_107553`).
Two header rows are correct for every sheet observed; extra rows are a parser bug.

## 2026-10-31 — National series are not prefixed with "Bangladesh" twice

`shortTitle()` adds "Bangladesh" only when the official name does not already say it.
Census series already start with "Census 2022", so they keep their name. This avoids
titles like "Bangladesh Bangladesh CPI".

## 2026-10-31 — Dead Pakistan routes and data removed

The frontend routes for funds, AMCs, securities, mandi, trade, energy, guides and blog were
removed rather than left as empty pages. The backend tables for those datasets remain in
`schema.sql` for compatibility but are not populated or exposed. Exposing an empty endpoint
is worse than not having it.

## 2026-10-31 — Scheduler on the VPS, not GitHub Actions

All current sources are reachable from the VPS. Running the scheduler beside Postgres
removes the SSH-tunnel and runner-IP complexity the Pakistan project needed. If a source
later blocks datacenter IPs, add a targeted GHA workflow rather than moving everything.

## 2026-11-01 — Cloudflare serving + GitHub Actions ingestion (supersedes 2026-10-31)

The public API and website now run on Cloudflare: Worker `bangladatahub-api` + D1 for reads,
Worker `bangladatahub` for the site. The heavy Python ingestion runs on GitHub Actions, not
inside a Worker, because the jobs need `pdfplumber`/`openpyxl`/`pandas`/`psycopg`/Tesseract,
minutes of CPU and hundreds of MB of memory. A GitHub Actions runner restores a Postgres
snapshot from R2, runs the jobs, dumps the result back to R2, and syncs changed rows to D1.
No VPS is required. The VPS path remains documented as an alternative for a persistent
Postgres or browser-based ingestion.

## 2026-11-01 — Site calls the API through a service binding

Cloudflare blocks Worker-to-Worker `fetch` on the same `*.workers.dev` zone with error 1042.
The website Worker therefore calls `env.API.fetch(...)` via the `API` service binding in
`frontend/wrangler.jsonc`. The public `BANGLADATA_API_BASE` is only for local dev, scripts
and non-Worker clients.

## 2026-11-01 — R2 Postgres snapshot is the durable ingestion state

The GitHub Actions runner has no persistent database host. `postgres/latest.dump` in R2 is
the durable state: restore → run jobs → dump → upload. A persistent `DATABASE_URL` secret
can bypass the snapshot path later. The workflow only uploads after a successful restore, so
a failed restore cannot overwrite the last good snapshot.

## 2026-11-01 — D1 is primary; R2 holds a per-series mirror

D1 is the serving database because the API needs catalog/search/status/revision SQL and
cross-series filters. R2 also gets `series/<id>.json` + `_index.json` (3,596 files / ~23.5
MB) for export, disaster recovery and a future R2-served read path. Pure R2 was rejected as
the primary store: “value > 50 across all series” would scan 3,596 objects instead of using
an index.

## 2026-11-01 — PBKDF2 at 100,000 iterations

Cloudflare WebCrypto rejects PBKDF2 above 100,000 iterations. New Worker hashes and new
Python hashes use 100k. Python still verifies old 200k hashes; the Worker cannot, so a
pre-existing 200k dashboard password needs a reset. API-key auth is unaffected.

## 2026-11-01 — Free-tier auth on the Worker; paid billing deferred

Signup, login, sessions, account, API keys and usage summary are implemented on D1. Paid
checkout, the billing portal, Google OAuth, webhook delivery and Redis-equivalent rate
limiting are not ported; those endpoints return a clear 501 or `{enabled:false}` rather than
pretending to work.

## 2026-11-01 — D1 free-tier limits are accepted, with resumable sync

D1 free allows 5M rows read/day, **100k rows written/day** and 5GB. The 118,991-row seed
exhausted the write budget; the sync now stops cleanly, leaves the watermark unchanged and
resumes after 00:00 UTC. Production should use Workers Paid for headroom. D1 batches are
also limited to 100 bound parameters, so `adminSync` flushes 5 statements at a time.

## 2026-11-01 — Custom domain remains pending

`bangladatahub.com` is not in the current Cloudflare account, so the live URLs are
`*.amaanjbutt.workers.dev`. The site’s canonical/SEO URLs already say `bangladatahub.com`.
Add the zone and the two Worker routes; update `BANGLADATA_API_BASE` /
`BANGLADATA_PUBLIC_API_BASE` to `https://api.bangladatahub.com`.
