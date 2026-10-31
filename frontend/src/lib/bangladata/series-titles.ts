/**
 * Hand-written, query-shaped <title> cores for the flagship series. Everything else
 * falls back to shortTitle() in series-title.ts. After editing, run
 * `npm run seo:titles` to check uniqueness against the live catalog.
 */
export const SERIES_TITLES: Record<string, string> = {
  "fx.rate.usd": "USD to BDT exchange rate — daily",
  "fx.rate.usd.history": "USD to BDT exchange rate — annual since 1972",
  "inflation.cpi.national": "Bangladesh CPI, all items — monthly",
  "inflation.cpi.national.yoy": "Bangladesh inflation rate — monthly YoY",
  "inflation.cpi.food.yoy": "Bangladesh food inflation — monthly YoY",
  "inflation.cpi.non_food.yoy": "Bangladesh non-food inflation — monthly YoY",
  "rates.policy": "Bangladesh Bank policy repo rate",
  "rates.call_money": "Call-money rate in Bangladesh — monthly",
  "rates.deposit": "Bank deposit rate in Bangladesh — monthly",
  "rates.lending": "Bank lending rate in Bangladesh — monthly",
  "monetary.m1": "Bangladesh M1 money supply — monthly",
  "monetary.m2": "Bangladesh M2 money supply — monthly",
  "reserves.gross": "Bangladesh foreign-exchange reserves — monthly",
  "remittances.total.usd": "Bangladesh workers' remittances — monthly",
  "gdp.current.market_price": "Bangladesh GDP at current prices",
  "gdp.constant.market_price": "Bangladesh real GDP at constant prices",
  "gdp.growth.constant": "Bangladesh real GDP growth — annual",
  "fiscal.nbr.total": "NBR tax revenue in Bangladesh — monthly",
  "market.dse.index.dsex": "DSEX index — Dhaka Stock Exchange",
  "market.dse.turnover": "DSE turnover — daily",
  "payments.mfs.accounts": "Mobile financial-services accounts in Bangladesh",
  "regional.census.population": "Census 2022 population by district",
  "regional.census.households": "Census 2022 households by district",
  "regional.census.sex_ratio": "Census 2022 sex ratio by district",
};
