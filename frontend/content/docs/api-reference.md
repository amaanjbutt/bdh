---
title: API reference
description: The BanglaDataHub v1 REST contract — envelopes, auth, pagination, formats and errors.
section: API reference
order: 1
---

# API reference

Base URL: `https://api.bangladatahub.com`

All endpoints return the same envelope:

```json
{"success": true, "data": [...], "meta": {...}, "pagination": {"count": 0, "next_cursor": null}}
```

Errors:

```json
{"success": false, "error": {"code": "not_found", "message": "unknown series"}}
```

## Authentication

Send `X-API-Key: bd_live_...`. A browser session (httpOnly cookie) is accepted for dashboard endpoints only.
Anonymous access is limited to public catalog and status endpoints.

## Core endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/catalog` | List series metadata; filter by `module`, `source`, `q` |
| GET | `/v1/catalog/{id}` | One series' metadata |
| GET | `/v1/series/{id}` | Observations; `from`, `to`, `limit`, `sort`, `format=csv`, `transform` |
| GET | `/v1/series/{id}/latest` | Latest observation |
| GET | `/v1/search?q=` | Ranked search across series and districts |
| GET | `/v1/regional/districts` | Census 2022 districts with population, households and sex ratio (public) |
| GET | `/v1/regional/district/{name}` | Every regional series' rows for one district (keyed) |
| GET | `/v1/market/overview` | DSE indices and the latest session (public) |
| GET | `/v1/market/securities` | Listed instruments, with `q`, `sector`, `limit` (public) |
| GET | `/v1/agri/dam` | DAM division-level daily retail prices, with `price_date`, `division`, `commodity` (public) |
| GET | `/v1/funds/registry` | BSEC mutual-fund registry, with `fund_type` and `q` (public) |
| GET | `/v1/funds/amcs` | Asset managers publishing NAVs, with fund counts and coverage (public) |
| GET | `/v1/funds/nav` | Latest NAV per fund, with `amc`, `fund`, `as_of` (public) |
| GET | `/v1/status` | Freshness, counts, module states |
| GET | `/v1/calendar` | Upcoming releases |
| GET | `/v1/plans` | Public plan matrix |
| GET | `/v1/usage` | Your usage (key required) |
| POST | `/v1/webhooks` | Register a signed webhook (paid plans) |

## Transforms

`?transform=yoy|mom|pct_change|3ma|index` applies a server-side transformation to the returned
observations. The response `meta.transform` echoes the applied transform.

## CSV

`?format=csv` returns the same rows as a text/csv attachment, with columns `date,value` and
one row per observation. Dimensions are included as `dims` JSON when present.

## Vintages

`?vintage=YYYY-MM-DD` returns the series as it was known at the end of that date, using the
`observation_revisions` history. Vintages are a paid feature.
