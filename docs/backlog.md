# Backlog

Open work, roughly in priority order.

## Data

1. **Bangladesh Bank Monthly Economic Trends.** `bb_workbook` now discovers the current
   issue and reads industrial production from its verified table. Review the revised
   layouts in the other tables before adding those series to the current-issue parser.
2. **BB EasyData.** BB's open-data portal has an API with more series than the workbook.
   Evaluate its quota and coverage; if it is usable, add `bb_easydata_sync` and keep the
   workbook as history.
3. **BB financial-inclusion history.** `fidfs_time_series_data.xlsx` has Dec-2018 → Jul-2025
   history, but its sheets put data rows inside the header range and the current parser
   creates numeric-suffix ids. Normalise the sheet headers, then add the file back to
   `bb_payments`.
4. ~~**BTRC telecom.**~~ Done 2026-10-31: `btrc_telecom` adds mobile subscribers by
   operator, internet subscribers, teledensity/mobile broadband, 3G/4G and tower counts.
   Still open: ARPU and cell-site counts (not on the same public tables).
5. ~~**TCB daily retail prices.**~~ Done 2026-10-31: `tcb_prices` reads the daily Dhaka
   XLSX for 58 essential items (min/max, BDT per kg/litre/hali/tonne).
6. **BERC retail tariff.** The order is a scanned 30-page PDF with no text layer. OCR
   (Tesseract `ben`) reads the prose but not a reliable tariff table; needs a table model
   before it can be published.
7. **DAM daily prices.** `dam_prices` reads the division archive. Market-level wholesale
   and retail reports are a separate source to add. Older image-only PDFs still need OCR.
8. **NBR monthly revenue.** Done for the current template (`nbr_revenue`, June 2026).
   Older NBR PDFs use different templates and are rejected by the subtotal check.
9. **Mutual funds.** `bsec_funds` covers the 141-fund registry and `amc_nav` covers 86
   funds at 21 managers. Still missing: AIMS of Bangladesh (NAV archive is a
   CSRF-protected paginated POST form), Alliance Capital, UniCap, Bhawal, Meghna,
   Abdul Monem, AIBL AMC, DBH AMC and NCCBL AMC — their sites either have no public NAV
   table or publish only a prospectus. Add adapters as those managers publish.
10. **Trade by HS product and partner.** EPB provides fiscal-year-to-date exports by
    destination and HS chapter. Imports and finer HS detail still need separate sources.
11. **Census geography.** The district workbooks now support separate upazila and thana
    totals. Add unions and wards after validating their codes across release layouts.
12. **Vintage backfill.** The trigger and `?vintage=` work; TCB reprints give one year of
    historical columns. A full multi-issue backfill (BB Monthly Economic Trends archive)
    is still open.

## Platform

1. ~~**R2.**~~ Done 2026-10-31: bucket `bangladeshdatahub-raw`, S3 token installed, uploads
   verified via `bb_web`. Also holds `postgres/latest.dump` and `series/<id>.json`.
2. ~~**Refresh `live-counts.json`.**~~ Done 2026-11-01: 3,596 series / 118,991 observations.
3. ~~**Deploy.**~~ Done 2026-11-01: `bangladatahub-api` (Worker + D1) and `bangladatahub`
   (website) are live on `*.amaanjbutt.workers.dev`; D1 seeded with 3,596 series /
   118,991 observations; `Ingest` workflow + R2 snapshot wired; free-tier auth/account/API
   keys and the dashboard work on D1; R2 has a 3,596-file `series/<id>.json` mirror (23.5 MB).
4. **Attach the custom domain.** Add the `bangladatahub.com` zone to Cloudflare, route
   `bangladatahub.com/*` → `bangladatahub` and `api.bangladatahub.com/*` →
   `bangladatahub-api`, then update `BANGLADATA_API_BASE` / `BANGLADATA_PUBLIC_API_BASE`.
5. **Enable the cron watchdog.** Set `GITHUB_TOKEN` (actions:write on `amaanjbutt/bdh`) on
   `bangladatahub-api`; the 30-minute cron then dispatches `ingest.yml` when data is >2 days
   old. GitHub's own daily schedule already runs it.
6. **Upgrade to Workers Paid.** D1 free allows 100k rows written/day; the initial seed
   exhausted it. Paid gives write/CPU headroom for the sync and for PBKDF2 signup.
7. **Port the remaining paid features.** Checkout/billing portal, Google OAuth, webhook
   delivery and Redis-equivalent rate limiting are not on the Worker yet. Free auth/keys/
   dashboard are.
8. **D1 request logging / usage counters.** `/v1/usage` returns zeros until requests are
   recorded. Add a bounded rollup (D1 or Workers Analytics Engine) if usage charts matter.
9. **Prune the legacy schema.** `agri_markets`, `agri_prices`, `funds`, `securities`,
   `trade_flows`, `ismo_merit_tokens` and related tables are unused. Drop them in a
   migration once no code references them.
10. **Remove dead frontend modules.** `mandi.ts`, `trade.ts`, `guides.ts` and the
    mandi/trade branches of `bot-render.ts` are no longer routed. Delete them and shrink the
    bundle.
11. **Data-quality job.** Schedule `data_quality` (spike/unit checks) and surface
    `dq_findings` on `/status`.
12. ~~**CI.**~~ Green on 2026-11-01 (`repo`, `backend`, `frontend`, `ingest`).

## Frontend

17. **District comparison.** A small multi-district table (population, sex ratio, household
    size) would make the census data more useful than one page at a time.
18. **Series pages for census indicators.** The title generator now handles long names, but
    the census series lack hand-written titles; add the headline ones to
    `series-titles.ts`.
19. **Calendar.** The release calendar is static. Wire it to `release_calendar` and the
    actual release cadence of BBS/BB/DSE/TCB.
