# Backlog

Open work, roughly in priority order.

## Data

1. **Bangladesh Bank current Monthly Economic Trends.** The advertised workbook is frozen
   at 2021 and the live file is F5-protected. Use the browser fallback
   (`BROWSER_FETCH=1`) from a workstation, confirm the download, then run `bb_workbook`.
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
7. **DAM daily prices.** `dam_prices` now reads the text-extractable division PDFs (six
   divisions, ~270 rows/day). Khulna, Barishal and part of Rangpur are image-only and still
   need OCR.
8. **NBR monthly revenue.** Done for the current template (`nbr_revenue`, June 2026).
   Older NBR PDFs use different templates and are rejected by the subtotal check.
9. **Mutual funds.** `bsec_funds` covers the 141-fund registry and `amc_nav` covers 86
   funds at 21 managers. Still missing: AIMS of Bangladesh (NAV archive is a
   CSRF-protected paginated POST form), Alliance Capital, UniCap, Bhawal, Meghna,
   Abdul Monem, AIBL AMC, DBH AMC and NCCBL AMC — their sites either have no public NAV
   table or publish only a prospectus. Add adapters as those managers publish.
10. **Trade by HS product and partner.** EPB gives product receipts; a full customs matrix
    needs NBR/BB data. Scope the smallest useful table (top 50 products × 20 partners).
11. **Census sub-district tables.** Add `dims.level=upazila|union` if there is demand; keep
    it a separate dimension so existing district queries do not change.
12. **Vintage backfill.** The trigger and `?vintage=` work; TCB reprints give one year of
    historical columns. A full multi-issue backfill (BB Monthly Economic Trends archive)
    is still open.

## Platform

10. ~~**R2.**~~ Done 2026-10-31: R2 enabled, bucket `bangladeshdatahub-raw` created, S3
    token installed and `storage.py` uploads verified via `bb_web`.
11. ~~**Refresh `live-counts.json`.**~~ Done 2026-11-01: 3,585 series / 115,901 observations.
12. **Prune the legacy schema.** `agri_markets`, `agri_prices`, `funds`, `securities`,
    `trade_flows`, `ismo_merit_tokens` and related tables are unused. Drop them in a
    migration once no code references them.
13. **Remove dead frontend modules.** `mandi.ts`, `trade.ts`, `guides.ts` and the
    mandi/trade branches of `bot-render.ts` are no longer routed. Delete them and shrink the
    bundle.
14. **Data-quality job.** Schedule `data_quality` (spike/unit checks) and surface
    `dq_findings` on `/status`.
15. ~~**Deploy.**~~ Done 2026-11-01: `bangladatahub-api` (Worker + D1) and
    `bangladatahub` (website) are live on `*.amaanjbutt.workers.dev`; D1 seeded with
    3,596 series / 118,991 observations; `Ingest` workflow + R2 snapshot wired.
    Remaining: add the `bangladatahub.com` zone and the two Worker routes; set
    `GITHUB_TOKEN` on the API Worker to enable the cron watchdog dispatch.
16. ~~**CI.**~~ Green on 2026-10-31 (`repo`, `backend`, `frontend`).

## Frontend

17. **District comparison.** A small multi-district table (population, sex ratio, household
    size) would make the census data more useful than one page at a time.
18. **Series pages for census indicators.** The title generator now handles long names, but
    the census series lack hand-written titles; add the headline ones to
    `series-titles.ts`.
19. **Calendar.** The release calendar is static. Wire it to `release_calendar` and the
    actual release cadence of BBS/BB/DSE/TCB.
