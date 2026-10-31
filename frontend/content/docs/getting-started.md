---
title: Getting started
description: Get an API key and make your first Bangladesh data request in under five minutes.
section: Introduction
order: 1
---

# Getting started

BanglaDataHub serves Bangladesh's official economic, financial and market data from one REST API.
Every series has a readable id, a unit, a frequency and a link to the publisher.

## 1. Get a key

Create a free account at [/signup](/signup). The free plan includes 500 requests per month
and one year of history. Paid plans unlock longer history, vintages and webhooks.

## 2. Make a request

```bash
curl -H "X-API-Key: bd_live_..." \
  "https://api.bangladatahub.com/v1/series/inflation.cpi.national.yoy/latest"
```

```json
{
  "success": true,
  "series": "inflation.cpi.national.yoy",
  "meta": {"name": "CPI inflation (national, YoY)", "unit": "percent", "frequency": "monthly"},
  "data": [{"date": "2026-09-01", "value": 8.34}]
}
```

## 3. Explore the catalog

```bash
curl -H "X-API-Key: bd_live_..." \
  "https://api.bangladatahub.com/v1/catalog?module=inflation&limit=50"
```

The catalog is the index: `GET /v1/series/{id}` returns metadata and observations;
`GET /v1/search?q=remittance` searches every series and entity.

## 4. Pick a module

| Module | What is inside |
|---|---|
| `forex` | USD/BDT, crosses, daily reference rate, 1972–2024 annual history |
| `inflation` | CPI national/food/non-food, YoY, 12-month average, long history |
| `rates` | Policy, call money, bank rates, T-bill and T-bond yields |
| `monetary` | M1, M2, currency, credit and the monetary survey |
| `external` | Exports, imports, reserves, remittances, product receipts |
| `payments` | MFS, cards, internet banking, QR and agent banking |
| `market` | DSEX, DS30, DSES, turnover and listed instruments |
| `regional` | Census 2022 district profiles |

:::note
The API is read-only. Ingestion runs are scheduled; each series page shows its last update
and next expected release.
:::
