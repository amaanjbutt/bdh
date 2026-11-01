# Data quality

The rule is simple: **settle suspect data at the source**. A value is not "wrong" because it
looks odd; it is wrong only when the publisher confirms a correction or the arithmetic
against the publisher's own totals fails.

## Gates every observation passes

1. **Catalog gate** — the series id must exist before points can be written. Jobs add
   publisher-defined series through `ensure_series` with a name, unit, frequency and source.
2. **Plausibility gate** — `min_value`, `max_value` and `max_step` are set per series. A
   point outside the gate is dropped and logged; the run is marked `partial`.
3. **Dedupe** — within one run, one value per `(series, date, dims)` survives (the last
   parsed). Several files restating the same point must not create fake revisions.
4. **Distinct upsert** — writes use `WHERE value IS DISTINCT FROM EXCLUDED.value`, so an
   unchanged re-run is a no-op.
5. **Vintage trigger** — `observation_revisions` records the previous value and the time it
   was replaced. Jobs never write `first_seen_at` or revisions by hand.

## Source-specific checks

### Bangladesh Bank workbooks

- The advertised current `statisticaltable.xlsx` has been frozen at 2021 for a long time.
  `bb_web` is the live edge; the workbook is the history.
- The 1972–2024 historical workbook is parsed separately and is the source for long annual
  series.
- Wide tables have merged headers; `bb_tables.py` expands merged cells and strips numeric
  header rows. A header that remains `column N` is a parser bug, not a data value.
- `bb_web` pages restate the latest month. When a value differs from the workbook, the
  HTML page wins because it is newer; the change is recorded as a revision.

### BBS CPI and GDP

- CPI is published as an index (base 2021-22 = 100) and as YoY/MoM/12-month-average
  inflation. Both are stored; the derived inflation series are not recomputed from the
  index unless the publisher omits them.
- GDP has provisional and final vintages. A new release that restates an earlier year is
  stored as a revision, not overwritten silently.

### Census 2022

- BBS publishes one workbook per district. Sheet names vary (`C-01`, `C01`, `C_01`), and
  the first rows differ between workbooks. The parser normalises the sheet name and reads
  the district headline row only (the first administrative unit followed by `Rural`), not
  upazila/union rows.
- `Female` must be matched before `Male` when mapping columns; "female" contains "male".
- Some sheets place column labels on the same row as the administrative-unit header and
  data immediately below; reading one extra header row turns data values into labels.
  The parser reads exactly two header rows.
- A district workbook that fails to parse is skipped and the run is `partial`; the fix is
  to inspect the sheet layout, not to patch the value.

### Dhaka Stock Exchange

- The live snapshot is a point-in-time view; the archive endpoint is the daily close. The
  job stores both, with the archive winning for the daily series.
- Instrument prices are stored in `dse_prices` and mirrored into `observations` only for
  the index/aggregate series. A missing instrument on a holiday is not a zero.

### EPB exports

- EPB publishes a summary workbook with fiscal-year-to-date and latest-month columns. The
  parser keeps the product-level receipts in USD million and records the fiscal year in the
  series id; it does not mix monthly and cumulative values in one series.

## Mutual-fund NAVs

Each AMC prints NAV in its own shape, so `amc_nav` has one adapter per manager. The
source-specific checks that matter:

- **National Asset Management** has a typo in the weekly table (`October. 28, 2028`).
  Rows dated in the future are dropped; the next day's row still covers that date.
- **CAPM** swapped the total-NAV and per-unit columns on 2024-05-09 and 2021-11-04. If
  the "per unit" column is more than 10x the total column, the adapter swaps them back
  before publishing.
- **LR Global**'s landing page says "February 22, 2025" but its per-fund NAV PDFs run to
  2026-02-26. The job reads the PDF dates, not the page label.
- **EDGE, IDLC, VIPB, RACE, Prime** and **CandleStone** publish only the current day.
  History accrues from each run; it cannot be backfilled from those pages.
- **Capitec** and **RACE** publish both a closed-end table and an open-end table on the
  same page. The adapter routes by the table header, so column-shifted rows are not
  mistaken for a different fund.

## Vintages and revisions

The `observation_revisions` trigger records the prior value whenever an observation changes,
and `observations.first_seen_at` says when we first held the point. The API exposes
`?vintage=YYYY-MM-DD` and `/v1/series/{id}/revisions` (Pro/Business).

TCB is the first source that prints several prior dates in every workbook (today, a week
ago, a month ago, a year ago). The `tcb_prices` job re-emits those columns as observations,
so a later workbook that restates an old date becomes a real revision. The same pattern can
be applied to any publisher that republishes history.

A full multi-issue backfill (BB Monthly Economic Trends archive) is still open; it needs an
adapter that maps each issue's printed values to the current series ids, as PakDataHub does
for the SBP Monthly Statistical Bulletin.

## Annotations

Publisher-confirmed odd values stay in the database and are explained in
`observation_notes` (series id, date, note, author, created_at). The API exposes notes on
the series/revision endpoints. Do not delete official values to make a chart look smooth.

## Quarantine

`dq_findings` records checks that failed (spikes, impossible values, unit slips). A finding
does not delete data; it flags it for review. The `data_quality` job is not yet scheduled
for Bangladesh; findings are currently reviewed manually after each large backfill.
