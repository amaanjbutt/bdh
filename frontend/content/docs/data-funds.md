---
title: Mutual funds
description: BSEC's 141-fund registry and daily NAVs from 20 Bangladesh asset managers.
section: Datasets
order: 10
---

# Mutual funds

## Registry

`GET /v1/funds/registry` returns every open-end and closed-end fund BSEC has registered,
with consent date, subscription window, issue size and prospectus link. `fund_type` filters
`open_end` or `closed_end`.

## NAVs

BSEC does not run a central NAV feed. Each asset manager publishes its own table, so the
`amc_nav` job keeps one adapter per manager and normalises everything to the same shape:

- `funds.<amc>.<fund>.nav` — transaction / fair NAV per unit, BDT
- `funds.<amc>.<fund>.nav_cost` — accounting NAV at cost, where the manager prints both
- `funds.<amc>.<fund>.market_price` — a separate investor buy/sell price, where it differs

In every series, `.nav` is the value used to buy or sell units (the manager's market or
fair NAV); `.nav_cost` is the accounting cost basis. This is the same convention across
all 20 managers, including ICB.

Examples: `funds.idlc.idlc_growth_fund.nav`, `funds.ucb.ucb_income_plus_fund.nav`,
`funds.lankabangla.lankabangla_fixed_income_fund.nav`.

### Managers covered

| Slug | Manager | Funds | History from |
|---|---|---|---|
| `icb` | ICB Asset Management | 15 | 2026 |
| `capitec` | Capitec Asset Management | 4 | 2026 |
| `capm` | CAPM (Capital & Asset Portfolio Management) | 3 | 2016 |
| `candlestone` | CandleStone Investments Partner | 1 | 2026 |
| `edge` | EDGE AMC | 4 | 2026 |
| `ekush` | Ekush Wealth Management | 3 | 2026 |
| `greendelta` | Green Delta Dragon Asset Management | 1 | 2023 |
| `idlc` | IDLC Asset Management | 4 | 2026 |
| `impress` | Impress Capital | 4 | 2016 |
| `investit` | Investit Asset Management | 1 | 2026 |
| `lankabangla` | LankaBangla Asset Management | 5 | 2016 |
| `lrglobal` | LR Global Bangladesh Asset Management | 6 | 2010 |
| `mbl` | MBL Asset Management | 1 | 2022 |
| `nam` | National Asset Management | 1 | 2022 |
| `prime` | Prime Finance Asset Management | 3 | 2026 |
| `race` | Bangladesh RACE Asset Management | 12 | 2026 |
| `sandhani` | Sandhani Asset Management | 2 | 2026 |
| `shanta` | Shanta Asset Management | 3 | 2026 |
| `ucb` | UCB Asset Management | 3 | 2021 |
| `vipb` | VIPB Asset Management | 6 | 2026 |

### API

- `GET /v1/funds/amcs` — managers, fund counts, observation counts and coverage dates
- `GET /v1/funds/nav` — latest NAV per fund; filters `amc`, `fund`, `as_of`
- `GET /v1/funds/registry` — BSEC registry

Dates are the publishers' own NAV dates. Where a manager publishes only the current day
(EDGE, IDLC, VIPB, RACE, Prime, CandleStone), history accrues from each daily run.

## Sources

- Registry: <https://www.sec.gov.bd/mutual-fund>
- ICB AMC: <https://icbamcl.gov.bd/investor-service/nav/nav-open-ended-mutual-funds>
- Per-manager URLs are in `backend/ingestion/jobs/amc_nav.py` and on each series'
  `source_url`.
