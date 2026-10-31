---
title: Telecom data
description: BTRC monthly mobile and internet subscribers, teledensity and tower counts.
section: Datasets
order: 6
---

# Telecom

The Bangladesh Telecommunication Regulatory Commission publishes monthly tables for mobile
subscribers by operator, internet subscribers, teledensity and operator tower counts.

## Series

- `telecom.mobile.gp`, `.robi`, `.banglalink`, `.teletalk`, `.total` — mobile subscribers,
  millions
- `telecom.internet.mobile`, `.isp_pstn`, `.total` — internet subscribers, millions
- `telecom.teledensity.total` — voice and internet subscriptions as a share of population
- `telecom.internet.penetration`, `telecom.broadband.fixed.penetration`,
  `telecom.internet.mobile.penetration`, `telecom.broadband.mobile.penetration` — percent
- `telecom.broadband.mobile.subscribers`, `telecom.mobile.3g.subscribers`,
  `telecom.mobile.4g.subscribers` — millions
- `telecom.towers.*` — operator tower counts and total

Dates are month-end. BTRC publishes Bengali labels and numerals; the parser normalises them
to ASCII digits and English month names.

## Source

BTRC statistics pages: <https://btrc.gov.bd/pages/static-pages/6922dda8933eb65569e15c3d>
(mobile), <https://btrc.gov.bd/site/page/347df7fe-409f-451e-a415-65b109a207f5/> (internet),
and the teledensity/tower pages linked from the BTRC statistics menu.
