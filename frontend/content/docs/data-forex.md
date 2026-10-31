---
title: Forex data
description: Daily USD/BDT reference rates, crosses, and the annual history back to 1972.
section: Datasets
order: 2
---

# Exchange rates

`fx.rate.usd` is the Bangladesh Bank weighted-average USD/BDT rate. The daily FX page also
provides bid and ask, and cross rates for EUR, GBP, INR, JPY, CNY, SGD, CAD and AUD.

`fx.rate.usd.history` is the annual series from Bangladesh Bank's 1972–2024 historical
workbook. It is the right series for long-run charts; the daily series is for current monitoring.

## Source notes

The daily rate is published by Bangladesh Bank on its exchange-rate page. The page shows the
latest business day; older daily files are archived but some paths are protected by an F5
web application firewall, so the ingestion job prefers the server-rendered HTML page and the
historical workbook.
