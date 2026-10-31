---
title: Trade data
description: BOP exports and imports, and product-level export receipts from EPB.
section: Datasets
order: 6
---

# Trade

Bangladesh Bank's balance-of-payments tables report goods exports, imports, the trade balance,
services, income and transfers. The EPB publishes a more granular product table in USD million.

## Series

- `external.exports`, `external.imports`, `external.trade_balance` — BOP totals in BDT crore
- `trade.exports.*` — one series per EPB product line, USD million
- Reserves and remittances are in the `external` module

## Fiscal year

Bangladesh's fiscal year runs July–June. Annual trade dates are 30 June; monthly and
fiscal-year-to-date observations are dated at the month/quarter end they cover.
