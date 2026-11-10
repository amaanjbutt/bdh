# Ingestion — every job, where it runs, when

Seventeen jobs are registered in `backend/ingestion/registry.py`. Each is an `IngestionJob`
subclass in `backend/ingestion/jobs/<name>.py`; its module docstring describes the source,
quirks and series ids. Run one by hand with:

```bash
docker compose exec api python -m ingestion.run <job> [--backfill] [--force]
```

The scheduler in `backend/ingestion/schedule.py` is the canonical cadence (Asia/Dhaka). In the
**legacy VPS** deployment it runs in the `scheduler` service. In the **primary Cloudflare**
deployment the heavy jobs run in `.github/workflows/ingest.yml` on GitHub Actions; the
workflow restores a Postgres snapshot from R2, runs the jobs, dumps it back, and syncs D1.
Every run is recorded in `ingestion_runs`; the staleness check alerts when a source is older
than its expected interval.

## Jobs

| Job | Source | Writes | Schedule (BST) |
|---|---|---|---|
| `bb_web` | Bangladesh Bank HTML pages: daily FX, reserves, remittances, bank rates, money supply, T-bill/T-bond auctions | `fx.*`, `reserves.*`, `remittances.*`, `rates.*`, `monetary.*` | daily 09:20 and 19:20 |
| `bb_workbook` | BB Monthly Economic Trends Table VIA + the 1972–2024 historical workbook | current industrial production and historical macro series | daily 06:20 |
| `bb_payments` | BB payment-systems monthly workbook: MFS, cards, internet/mobile banking, QR, agent banking | `payments.*` | daily 06:45 |
| `bbs_cpi` | BBS dated release table and monthly CPI workbook | `inflation.cpi.*`, including rural and urban CPI | daily 07:10 |
| `btrc_telecom` | BTRC monthly mobile/internet subscribers, teledensity and tower tables | `telecom.*` | daily 09:40 |
| `nbr_revenue` | NBR monthly revenue-collection PDF: customs, VAT, income tax and components | `fiscal.nbr.*` | daily 08:25 |
| `bpdb_power` | BPDB/NLDC daily system summary: generation, demand, fuel mix, imports, load-shed | `energy.power.*` | daily 10:10 |
| `dam_prices` | DAM daily division-level retail-price archive | `dam_prices` table + `dam.prices.rows` | daily 09:50 |
| `icb_nav` | ICB AMC daily open-ended fund NAV and market price | `funds.icb.*` | Sun-Thu 17:30 |
| `amc_nav` | NAV tables from 20 other asset managers (HTML, PDF and JSON) | `funds.<amc>.*` | Sun-Thu 18:15 |
| `bsec_funds` | BSEC mutual-fund registry: open-end and closed-end issues | `fund_registry` + `funds.registry.funds` | daily 09:30 |
| `bbs_gdp` | BBS GDP release page and annual GDP workbook | `gdp.*` | daily 07:40 |
| `bbs_census` | BBS Population & Housing Census 2022: one workbook per district | District series and `regional.census.subdistrict.*` | Sunday 03:20 |
| `dse_market` | Dhaka Stock Exchange live snapshot, daily archive and instrument list | `market.dse.*`, `dse_indices`, `dse_prices`, `dse_securities` | Sun–Thu 16:30 |
| `epb_exports` | EPB goods summary and country-wise workbooks selected by fiscal period | Product lines, destination totals, and HS chapters and headings by destination | daily 08:10 |
| `tcb_prices` | TCB daily Dhaka retail-price workbook (essential commodities) | `prices.tcb.*` | daily 08:40 |
| `derive_indicators` | Derived layer from official inputs (real call-money rate, real M2 growth, remittance growth, BDT depreciation) | `derived.*` | daily 10:00 |

`amc_nav` is one scheduled job with 20 small adapters. Each adapter owns one manager's
URL and table shape; the job normalises to `funds.<amc>.<fund>.nav`, `.nav_cost` and
`.market_price`. A manager that fails to fetch is skipped, and `funds.amc_nav.managers`
records how many answered; if every adapter fails, the run fails.

`bb_workbook` and `bb_web` overlap deliberately: the workbook gives long history and the
HTML pages give the current month. `bb_web` runs twice a day because BB updates the FX and
reserve pages during the working day.

## Primary runner: GitHub Actions

`.github/workflows/ingest.yml` runs the heavy Python jobs daily at **01:30 UTC** (07:30
Asia/Dhaka) and on `workflow_dispatch`:

1. Start `postgres:18` and `redis:7` service containers.
2. Restore `s3://bangladeshdatahub-raw/postgres/latest.dump`.
3. Run the selected jobs with `python -m ingestion.run <job> --force`.
4. Dump Postgres back to R2, export `series/<id>.json`, and sync changed rows to D1.

The default set is every job except `bbs_census` (run this separately with the `jobs`
input for the one-off census import). Use `census_limit` to trial a smaller set of
workbooks before importing the full archive. Set `jobs` to a comma-separated subset for a
targeted refresh. With `backfill` enabled, EPB and CPI process the recent releases
listed on their publisher pages in period order.

The workflow reaches BBS, EPB, DAM and BTRC release pages through an authenticated
Cloudflare Worker. Publisher files linked on separate storage hosts are downloaded
directly. Workstations fetch directly when no relay is configured.

A manager timeout inside `amc_nav` is a **partial source failure**: the job skips that
manager, records the remaining count in `funds.amc_nav.managers`, and still succeeds. If
every adapter fails, the job fails. A full AMC run is ~5 minutes; the whole default set is
~8 minutes in practice.

After the jobs, `scripts.sync_d1` pushes changed rows to the API Worker. D1's free tier is
100k rows written/day; the sync stops cleanly at that cap and resumes on the next run. See
[`cloudflare-runbook.md`](./cloudflare-runbook.md).

## How a run works

1. **Fetch** — the job returns one or more `FetchedFile`s. A fetch that fails everywhere
   raises; returning `[]` would read as healthy and is never allowed.
   A job can record a missing expected attachment as a fetch warning. If other files
   are usable, the run is marked partial and their observations are retained.
2. **Archive** — the raw bytes are written to `RAW_ARCHIVE_DIR` (local volume
   `rawdata`) and, when R2 is configured, mirrored to the bucket. The path is recorded on
   the `ingestion_runs` row.
3. **Parse** — each file is parsed independently. A malformed file is skipped and
   recorded; if every file fails the run fails.
4. **Validate** — every point must pass the series' plausibility gate
   (`min_value`, `max_value`, `max_step`) and the catalog must already contain the series
   id (jobs add publisher-defined series through `ensure_series`).
5. **Upsert** — one value per `(series, date, dims)`, with
   `WHERE value IS DISTINCT FROM EXCLUDED.value`, so restatements do not create fake
   revisions. The `observation_revisions` trigger owns first-seen dates and revisions.
6. **Finish** — the run is marked `success`, `partial` or `failed` in `ingestion_runs`.

## Census workbooks

BBS publishes one workbook per district. Sheet names vary (`C-01`, `C01`, `C_01`), so the job
normalises them. District series still use the district headline row with
`dims={"district": ..., "division": ...}`. `C-01` supplies
population, households and sex ratio; `C-02` age groups; `C-06` education; `C-08`/`C-09`
work; `C-14`–`C-18` housing, water, sanitation, fuel and household size; `C-03`/`C-13`
religion and ethnicity; `C-11`/`C-12` connectivity and finance.

Separate upazila and thana series use C-01 geography codes to select totals. They
also cover age, education, drinking water, sanitation, and household size when a
unique C-01 subdistrict name matches the corresponding table. District, city
corporation, union, ward, and village totals are excluded from this series family.

## Browser-only downloads

Some Bangladesh Bank files are behind an F5 challenge that rejects scripted requests.
`backend/ingestion/browser_fetch.py` drives a local Chrome/Chromium to download them when
`BROWSER_FETCH=1` and `CHROME_PATH` are set. This is a workstation fallback, not part of
the scheduled VPS path.
