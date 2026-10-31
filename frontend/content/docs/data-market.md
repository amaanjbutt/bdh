---
title: DSE market data
description: DSEX, DS30, DSES, turnover, market capitalisation and listed-instrument OHLCV.
section: Datasets
order: 4
---

# Dhaka Stock Exchange

The DSE JSON API publishes a live snapshot of every listed instrument plus the DSEX, DS30 and
DSES indices, turnover, volume, trades and market capitalisation.

## Series

- `market.dse.index.dsex`, `.ds30`, `.dses`
- `market.dse.turnover` (BDT million)
- `market.dse.volume`, `market.dse.trades`
- `market.dse.market_cap.total` (BDT billion)
- `market.dse.index.general` and `market.dse.turnover` include the older annual table

## Instruments

Every listed scrip is stored in `dse_securities` with its sector, board, category and asset type,
and `dse_prices` with daily open/high/low/close/ltp/volume/value/trades. The `/market` explorer
reads these tables directly.

## Access

The DSE endpoints are public and unauthenticated. We poll once per session, not intraday.
