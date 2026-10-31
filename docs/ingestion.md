# Ingestion — every job, where it runs, when

Nine jobs are registered in `backend/ingestion/registry.py`. Each is an `IngestionJob`
subclass in `backend/ingestion/jobs/<name>.py`; its module docstring describes the source,
quirks and series ids. Run one by hand with:

```bash
docker compose exec api python -m ingestion.run <job> [--backfill] [--force]
```

The scheduler runs in the `scheduler` service on the VPS (`python -m ingestion.scheduler`,
Asia/Dhaka). It reads `backend/ingestion/schedule.py` and records every run in
`ingestion_runs`; the staleness check alerts when a source is older than its expected
interval.

## Jobs

| Job | Source | Writes | Schedule (BST) |
|---|---|---|---|
| `bb_web` | Bangladesh Bank HTML pages: daily FX, reserves, remittances, bank rates, money supply, T-bill/T-bond auctions | `fx.*`, `reserves.*`, `remittances.*`, `rates.*`, `monetary.*` | daily 09:20 and 19:20 |
| `bb_workbook` | BB Monthly Economic Trends workbook (current issue) + the 1972–2024 historical workbook | ~500 macro series in `forex`, `monetary`, `external`, `fiscal`, `real`, `agri`, `industry`, `commodities` | daily 06:20 |
| `bb_payments` | BB payment-systems monthly workbook: MFS, cards, internet/mobile banking, QR, agent banking | `payments.*` | daily 06:45 |
| `bbs_cpi` | BBS CPI release page and monthly CPI workbook | `inflation.cpi.*` | daily 07:10 |
| `bbs_gdp` | BBS GDP release page and annual GDP workbook | `gdp.*` | daily 07:40 |
| `bbs_census` | BBS Population & Housing Census 2022: one workbook per district (64) | `regional.census.*` with `dims.district` and `dims.division` | Sunday 03:20 |
| `dse_market` | Dhaka Stock Exchange live snapshot, daily archive and instrument list | `market.dse.*`, `dse_indices`, `dse_prices`, `dse_securities` | Sun–Thu 16:30 |
| `epb_exports` | Export Promotion Bureau monthly export summary workbook | `trade.exports.*` | daily 08:10 |
| `derive_indicators` | Derived layer from official inputs (real call-money rate, real M2 growth, remittance growth, BDT depreciation) | `derived.*` | daily 10:00 |

`bb_workbook` and `bb_web` overlap deliberately: the workbook gives long history and the
HTML pages give the current month. `bb_web` runs twice a day because BB updates the FX and
reserve pages during the working day.

## How a run works

1. **Fetch** — the job returns one or more `FetchedFile`s. A fetch that fails everywhere
   raises; returning `[]` would read as healthy and is never allowed.
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

BBS publishes 64 district workbooks. Sheet names vary (`C-01`, `C01`, `C_01`), so the job
normalises them. It reads only the district headline row (the first administrative unit,
followed by `Rural`), not the upazila/union rows, and publishes one observation per
indicator per district with `dims={"district": ..., "division": ...}`. `C-01` supplies
population, households and sex ratio; `C-02` age groups; `C-06` education; `C-08`/`C-09`
work; `C-14`–`C-18` housing, water, sanitation, fuel and household size; `C-03`/`C-13`
religion and ethnicity; `C-11`/`C-12` connectivity and finance.

## Browser-only downloads

Some Bangladesh Bank files are behind an F5 challenge that rejects scripted requests.
`backend/ingestion/browser_fetch.py` drives a local Chrome/Chromium to download them when
`BROWSER_FETCH=1` and `CHROME_PATH` are set. This is a workstation fallback, not part of
the scheduled VPS path.
