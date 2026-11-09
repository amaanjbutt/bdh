---
title: DAM daily market prices
description: Division-level retail prices from the Department of Agricultural Marketing.
section: Datasets
order: 11
---

# DAM daily market prices

The Department of Agricultural Marketing publishes a daily table per division with the
current retail price range, the previous month's and the previous year's range. The job
reads the division PDFs whose table is text-extractable and stores them in `dam_prices`.

## API

- `GET /v1/agri/dam` — latest date; filters `price_date`, `division`, `commodity`
- `GET /v1/agri/dam/dates` — available dates and divisions

Rows carry `division`, `commodity`, `unit`, `current_min`, `current_max`,
`month_ago_min`, `month_ago_max`, `year_ago_min`, `year_ago_max`.

Division names come from the daily archive's column headings. Coverage varies by
report date and by PDF layout. Image-only PDFs and unrecognised tables are recorded
as ingestion issues. If a historical price cell is blank or unreadable, its value
is null.
