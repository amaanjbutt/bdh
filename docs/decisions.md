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
