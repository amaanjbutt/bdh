---
title: NBR revenue
description: Monthly NBR tax collection by customs, VAT, income tax and components.
section: Datasets
order: 9
---

# NBR revenue

The National Board of Revenue publishes a monthly Revenue Collection statement. The job
reads the latest PDF and publishes the month's collection and the fiscal-year-to-date
collection. Values are crore taka.

## Series

- `fiscal.nbr.total` / `.fy_to_date` — total tax revenue
- `fiscal.nbr.customs` / `.fy_to_date` — customs subtotal
- `fiscal.nbr.vat` / `.fy_to_date` — VAT subtotal
- `fiscal.nbr.income_tax` / `.fy_to_date` — income tax
- component series: `fiscal.nbr.customs_import_duty`, `fiscal.nbr.vat_import`,
  `fiscal.nbr.supplementary_import`, `fiscal.nbr.regulatory_duty`,
  `fiscal.nbr.export_duty`, `fiscal.nbr.other_customs`, `fiscal.nbr.excise`,
  `fiscal.nbr.vat_local`, `fiscal.nbr.supplementary_local`, `fiscal.nbr.turnover_tax`,
  `fiscal.nbr.other_local`, `fiscal.nbr.travel_tax`, `fiscal.nbr.other_taxes`,
  `fiscal.nbr.tax_subtotal`

The job validates that the customs, VAT and tax subtotals add up before it writes a row.
Older NBR PDFs with a different table layout are skipped rather than guessed.

## Source

<https://nbr.gov.bd/publications/research-statistics/eng>
