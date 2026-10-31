---
title: Sources & provenance
description: Every publisher behind BanglaDataHub, its cadence and its access notes.
section: Resources
order: 1
---

# Sources & provenance

| Source | Data | Cadence | Notes |
|---|---|---|---|
| Bangladesh Bank | FX, reserves, remittances, rates, money, BOP, payments, statistical tables | daily / monthly | `bb.org.bd`; some file paths are F5-protected |
| BBS | CPI, GDP, Census 2022, Wage Rate Index | monthly / annual / census | `bbs.gov.bd` + Oracle object storage |
| NBR | Tax receipts | monthly | published through the BB statistical tables |
| EPB | Export receipts by product | monthly | XLSX summary workbook |
| DSE | Indices, turnover, listed instrument OHLCV | daily | public JSON API |

## Rules

- Every raw file is archived before parsing, with a SHA-256 and source URL.
- Values are validated against catalog bounds and a large-step gate.
- A publisher revision is stored in `observation_revisions`; we never hand-write a revision.
- If every fetch fails, the ingestion run fails and alerts. An empty result is not silently healthy.
