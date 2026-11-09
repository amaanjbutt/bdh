---
title: Inflation data
description: BBS CPI coverage, base years, and how to read the national, food and non-food series.
section: Datasets
order: 1
---

# Inflation

Bangladesh Bureau of Statistics publishes monthly CPI with a **2021-22 base**. The headline
series is `inflation.cpi.national.yoy` (point-to-point change); `inflation.cpi.national.12m_avg`
is the 12-month moving average.

## Base years matter

BBS changed the CPI base over time. The current series is base 2021-22. Older Bangladesh Bank
tables use a 2005-06 base and are published separately as `inflation.cpi.national.2005base`.
The long annual history (`inflation.cpi.national.long`) starts in the 1970s and uses the base
of its original table — compare growth rates, not index levels across bases.

## Coverage

- National, food and non-food indices and inflation
- Monthly rural and urban indices and inflation, for example `inflation.cpi.rural.yoy`
- Expenditure divisions by COICOP code across all three areas, for example
  `inflation.cpi.urban.coicop.04.yoy` for housing and utilities
- Annual and monthly observations
- Historical annual series for long-run charts
- Wage Rate Index by sector and division in the `social` module
