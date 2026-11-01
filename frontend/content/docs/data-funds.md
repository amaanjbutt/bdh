---
title: Mutual funds
description: BSEC's fund registry and ICB Asset Management's daily open-ended fund NAVs.
section: Datasets
order: 10
---

# Mutual funds

## Registry

`GET /v1/funds/registry` returns every open-end and closed-end fund BSEC has registered,
with consent date, subscription window, issue size and prospectus link. `fund_type` filters
`open_end` or `closed_end`.

## NAVs

ICB Asset Management Company publishes a daily NAV table for its open-ended funds. The job
reads the table and publishes both the NAV and the market price per fund.

- `funds.icb.<fund>.nav` — NAV per unit in BDT
- `funds.icb.<fund>.market_price` — market price per unit in BDT

Examples: `funds.icb.icb_amcl_unit_fund.nav`, `funds.icb.bangladesh_fund.nav`.

The date is the “as on” date printed by ICB AMC. This is the first AMC adapter; other
managers can be added with the same table shape.

## Sources

- Registry: <https://www.sec.gov.bd/mutual-fund>
- NAVs: <https://icbamcl.gov.bd/investor-service/nav/nav-open-ended-mutual-funds>
