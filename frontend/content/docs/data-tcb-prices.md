---
title: TCB daily retail prices
description: Dhaka essential-commodity retail prices from the Trading Corporation of Bangladesh.
section: Datasets
order: 7
---

# TCB daily retail prices

The Trading Corporation of Bangladesh publishes a daily XLSX of Dhaka retail prices for
essential commodities: rice, atta, maida, edible oils, pulses, vegetables, spices, fish,
meat, milk powder, sugar, salt, eggs, paper and MS rod.

## Series

Each item has a minimum and maximum price:

- `prices.tcb.rice_fine.min` / `.max`
- `prices.tcb.atta_open.min` / `.max`
- `prices.tcb.soybean_oil_loose.min` / `.max`
- `prices.tcb.onion_local.min` / `.max`
- `prices.tcb.egg_farm.min` / `.max`

The unit is in the series name and in `dims.unit` (for example `kg`, `litre`, `hali`,
`dosta`, `tonne`). Values are BDT. Dates are the trading day; the job reads the 20 most
recent workbooks on the TCB page.

## Source

<https://tcb.gov.bd/pages/daily-rmps>
