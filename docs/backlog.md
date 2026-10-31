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
6. **BERC / BPDB energy.** Tariffs, generation, demand. Start with the annual reports, then
   the monthly dashboard if it is machine-readable.
7. **NBR monthly revenue.** The current NBR series come from the BB workbook. Add the NBR
   release page for the latest month and reconcile the overlap.
8. **Trade by HS product and partner.** EPB gives product receipts; a full customs matrix
   needs NBR/BB data. Scope the smallest useful table (top 50 products × 20 partners).
9. **Mutual funds and DSE company fundamentals.** Not in scope for launch; the DSE feed
   covers prices and indices only.
10. **Census sub-district tables.** Add `dims.level=upazila|union` if there is demand; keep
    it a separate dimension so existing district queries do not change.

## Platform

10. ~~**R2.**~~ Done 2026-10-31: R2 enabled, bucket `bangladeshdatahub-raw` created, S3
    token installed and `storage.py` uploads verified via `bb_web`.
11. ~~**Refresh `live-counts.json`.**~~ Done 2026-10-31: 3,232 series / 88,274 observations.
12. **Prune the legacy schema.** `agri_markets`, `agri_prices`, `funds`, `securities`,
    `trade_flows`, `ismo_merit_tokens` and related tables are unused. Drop them in a
    migration once no code references them.
13. **Remove dead frontend modules.** `mandi.ts`, `trade.ts`, `guides.ts` and the
    mandi/trade branches of `bot-render.ts` are no longer routed. Delete them and shrink the
    bundle.
14. **Data-quality job.** Schedule `data_quality` (spike/unit checks) and surface
    `dq_findings` on `/status`.
15. **Deploy.** Set `VPS_HOST`, install the deploy key, run `deploy_from_pc.sh vps` and
    `web`, then point `api.bangladatahub.com` at the VPS and `bangladatahub.com` at the
    Worker.
16. ~~**CI.**~~ Green on 2026-10-31 (`repo`, `backend`, `frontend`).

## Frontend

17. **District comparison.** A small multi-district table (population, sex ratio, household
    size) would make the census data more useful than one page at a time.
18. **Series pages for census indicators.** The title generator now handles long names, but
    the census series lack hand-written titles; add the headline ones to
    `series-titles.ts`.
19. **Calendar.** The release calendar is static. Wire it to `release_calendar` and the
    actual release cadence of BBS/BB/DSE/TCB.
