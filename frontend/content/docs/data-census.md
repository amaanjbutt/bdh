---
title: Census 2022 district data
description: District indicators and published upazila or thana totals from the BBS census.
section: Datasets
order: 5
---

# Census 2022

The 2022 Population and Housing Census is the latest full count of Bangladesh. BBS publishes
one workbook per district with tables C-01 to C-18 and an SDG union table.

## What we publish

- Population, households, sex ratio and household size (C-01, C-18)
- Population by five-year age group (C-02)
- Religion and ethnic population (C-03, C-13)
- Education and work (C-06, C-08, C-09)
- Housing structure, drinking water, sanitation and cooking fuel (C-14 to C-17)
- Internet, mobile-phone ownership and financial accounts (C-11, C-12)
- SDG indicators at district level

District observations are dated 2022-06-30, with
`dims={"district": "Dhaka", "division": "Dhaka"}`.
The district explorer at [/districts](/districts) joins the headline series into one profile.

Upazila and thana totals are available separately under `regional.census.subdistrict.*`.
They cover population, households, sex ratio, age, education, drinking water,
sanitation, and household size where the workbook identifies the subdistrict.
Filter the population series with
`/v1/series/regional.census.subdistrict.population?dims=district:Barishal`.
The returned dimensions include the BBS district and subdistrict codes, plus a
city corporation code when BBS supplies one.
