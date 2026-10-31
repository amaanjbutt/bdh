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
| NBR | Tax receipts | monthly | PDF revenue-collection statement |
| EPB | Export receipts by product | monthly | XLSX summary workbook |
| BPDB / NLDC | Daily generation, demand, fuel mix, imports, load-shedding | daily | PDF System Summary Report |
| DSE | Indices, turnover, listed instrument OHLCV | daily | public JSON API |
| BTRC | Mobile/internet subscribers, teledensity, 3G/4G, tower counts | monthly | public HTML tables (Bengali labels) |
| TCB | Dhaka daily essential-commodity retail prices | daily | XLSX per trading day |

## Rules

- Every raw file is archived before parsing, with a SHA-256 and source URL.
- Values are validated against catalog bounds and a large-step gate.
- A publisher revision is stored in `observation_revisions`; we never hand-write a revision.
- If every fetch fails, the ingestion run fails and alerts. An empty result is not silently healthy.
