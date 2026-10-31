---
title: Series & catalog
description: How series ids work, what units and dimensions mean, and how to page through the catalog.
section: API reference
order: 2
---

# Series & catalog

A series is one time series with a stable id.

```
<topic>.<group>.<item>
inflation.cpi.national.yoy
fx.rate.usd
rates.tbill.91d
market.dse.index.dsex
regional.census.population
```

## Metadata

`GET /v1/catalog/{id}` returns id, module, name, description, unit, frequency, source,
source URL, dimensions, first/last date and whether the series is derived.

## Units

| Unit | Meaning |
|---|---|
| `bdt`, `bdt_bn`, `bdt_mn`, `bdt_crore` | taka, billion, million, crore |
| `usd`, `usd_mn`, `usd_bn` | US dollars |
| `percent` | percentage points |
| `index` | index level |
| `count` | persons, accounts, instruments, trades |
| `thousand_tonnes` | production / area tables |

## Dimensions

Breakdowns are carried in `dims`, not in the id:

```json
{"district": "Dhaka"}
{"side": "bid"}
{"division": "khulna"}
```

Query with `?dims=district:Dhaka` (subset match).
