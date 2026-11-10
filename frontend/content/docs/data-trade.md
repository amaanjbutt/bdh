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
- `trade.exports.frozen_and_live_fish_01_03.other.ytd` — an example of a category-specific
  “Other” line from the EPB summary sheet
- `trade.exports.country.ytd` — fiscal-year-to-date EPB goods exports by destination
- `trade.exports.hs2.61.ytd` — example HS chapter, with `?dims=country:US` for a destination
- `trade.exports.hs4.6109.ytd` — example four-digit HS heading (knitted or crocheted T-shirts,
  singlets and other vests), with the same destination filter
- Reserves and remittances are in the `external` module

## Fiscal year

Bangladesh's fiscal year runs July–June. Annual trade dates are 30 June; monthly and
fiscal-year-to-date observations are dated at the month/quarter end they cover.
Destination, HS chapter and HS heading series use EPB country codes and USD million.
They report the cumulative fiscal-year-to-date figure printed in the source workbook.
