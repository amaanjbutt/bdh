---
title: Power-system data
description: BPDB/NLDC daily generation, demand, fuel mix, imports and load-shedding.
section: Datasets
order: 8
---

# Power system

The Bangladesh Power Development Board and the National Load Dispatch Center publish a
daily System Summary Report. The job reads the 10 most recent `page_1` PDFs.

## Series

- `energy.power.day_peak_generation`, `.day_peak_demand`,
  `.evening_peak_generation`, `.evening_peak_demand` — MW
- `energy.power.min_generation`, `.max_generation` — MW
- `energy.power.energy_generated`, `.energy_demand`, `.energy_unserved` — MKWh
- `energy.power.gas_supplied` — MMCFD
- `energy.power.production_cost` — BDT per kWh
- `energy.power.import_total` — MKWh through the C/B interconnector
- `energy.power.generation.<zone>.<fuel>` — zone-by-fuel generation, MKWh
- `energy.power.load_shed.<zone>`, `energy.power.demand.<zone>` — MW at evening peak

Zones are Dhaka, Chattogram, Cumilla, Mymensingh, Sylhet, Khulna, Barishal, Rajshahi and
Rangpur. Fuels are gas, coal, HFO, HSD, hydro, solar, import and wind.

## Source

<https://misc.bpdb.gov.bd/daily-generation-archive>
