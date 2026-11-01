---
title: Mutual fund NAVs
description: ICB Asset Management's daily open-ended fund NAV and market price.
section: Datasets
order: 10
---

# Mutual funds

ICB Asset Management Company publishes a daily NAV table for its open-ended funds. The
job reads the table and publishes both the NAV and the market price per fund.

## Series

- `funds.icb.<fund>.nav` — NAV per unit in BDT
- `funds.icb.<fund>.market_price` — market price per unit in BDT

Examples: `funds.icb.icb_amcl_unit_fund.nav`,
`funds.icb.bangladesh_fund.nav`.

The date is the “as on” date printed by ICB AMC. This is the first AMC adapter; other
managers can be added with the same table shape.

## Source

<https://icbamcl.gov.bd/investor-service/nav/nav-open-ended-mutual-funds>
