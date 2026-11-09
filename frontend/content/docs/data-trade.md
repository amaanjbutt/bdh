---
title: Trade data
description: BOP exports and imports, plus EPB goods exports by product and destination.
section: Datasets
order: 6
---

# Trade

Bangladesh Bank's balance-of-payments tables report goods exports, imports, the trade balance,
services, income and transfers. The EPB publishes a more granular product table in USD million.

## Series

- `external.exports`, `external.imports`, `external.trade_balance` — BOP totals in BDT crore
- `trade.exports.*` — EPB goods exports by product line, USD million
- `trade.exports.country.ytd` — fiscal-year-to-date EPB goods exports by destination
- `trade.exports.hs2.61.ytd` — example HS chapter, with `?dims=country:US` for a destination
- Reserves and remittances are in the `external` module

## Fiscal year

Bangladesh's fiscal year runs July–June. Annual trade dates are 30 June; monthly and
fiscal-year-to-date observations are dated at the month/quarter end they cover.
Destination and HS chapter series use EPB country codes and USD million. They
report the cumulative fiscal-year-to-date figure printed in the source workbook.
