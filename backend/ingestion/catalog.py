"""Curated catalog for series that are not derived from the BB statistical workbook.

These are the flagship, human-named series. Jobs may add more metadata rows at
run time (DSE instruments, payment tables), but the public core stays explicit
so names, units and plausibility gates are reviewable in one place.
"""
from __future__ import annotations

from typing import Any

BB = "https://www.bb.org.bd/en/index.php/econdata"
DSE = "https://www.dsebd.org"
BBS_CPI = "https://bbs.gov.bd/site/page/29b379ff-7bac-41d9-b321-e41929bab4a1/CPI-and-QIIP"
BBS_GDP = "https://bbs.gov.bd/site/page/dc2bc6ce-7080-48b3-9a04-73cec782d0df/Gross-Domestic-Product-(GDP)"
NBR = "https://nbr.gov.bd/publications/research-statistics/eng"
EPB = "https://epb.gov.bd/views/epb-export-data"
BTRC = "https://btrc.gov.bd/site/page/347df7fe-409f-451e-a415-65b109a207f5/"
BERC = "https://berc.org.bd"
TCB = "https://tcb.gov.bd/pages/daily-rmps"
DAM = "https://dam.gov.bd/pages/marketprice"


def S(
    id: str, module: str, name: str, unit: str, frequency: str, source: str,
    source_url: str, description: str = "", dims: dict[str, Any] | None = None,
    min_value: float | None = None, max_value: float | None = None,
    max_step: float | None = None, tier: str = "basic",
) -> dict:
    return {
        "id": id, "module": module, "name": name, "description": description or name,
        "unit": unit, "frequency": frequency, "source": source, "source_url": source_url,
        "dimensions": dims or {}, "min_value": min_value, "max_value": max_value,
        "max_step": max_step, "tier": tier,
    }


CORE: list[dict] = [
    # ---- FX ---------------------------------------------------------------
    S("fx.rate.usd", "forex", "USD/BDT reference rate", "bdt", "daily", "BB",
      f"{BB}/exchangerate", "Bangladesh Bank weighted-average USD/BDT rate (WAR).", min_value=40, max_value=300, max_step=10),
    S("fx.rate.usd.bid", "forex", "USD/BDT bid", "bdt", "daily", "BB",
      f"{BB}/exchangerate", "Interbank USD/BDT bid rate at Dhaka close.", min_value=40, max_value=300, max_step=10),
    S("fx.rate.usd.ask", "forex", "USD/BDT ask", "bdt", "daily", "BB",
      f"{BB}/exchangerate", "Interbank USD/BDT ask rate at Dhaka close.", min_value=40, max_value=300, max_step=10),
    S("fx.rate.eur", "forex", "EUR/BDT", "bdt", "daily", "BB", f"{BB}/exchangerate", min_value=40, max_value=400, max_step=15),
    S("fx.rate.gbp", "forex", "GBP/BDT", "bdt", "daily", "BB", f"{BB}/exchangerate", min_value=40, max_value=500, max_step=20),
    S("fx.rate.inr", "forex", "INR/BDT", "bdt", "daily", "BB", f"{BB}/exchangerate", min_value=0.5, max_value=5, max_step=0.5),
    S("fx.rate.jpy", "forex", "JPY/BDT", "bdt", "daily", "BB", f"{BB}/exchangerate", min_value=0.2, max_value=3, max_step=0.2),
    S("fx.rate.cny", "forex", "CNY/BDT", "bdt", "daily", "BB", f"{BB}/exchangerate", min_value=5, max_value=50, max_step=3),
    S("fx.rate.sgd", "forex", "SGD/BDT", "bdt", "daily", "BB", f"{BB}/exchangerate", min_value=30, max_value=250, max_step=10),
    S("fx.rate.cad", "forex", "CAD/BDT", "bdt", "daily", "BB", f"{BB}/exchangerate", min_value=30, max_value=250, max_step=10),
    S("fx.rate.aud", "forex", "AUD/BDT", "bdt", "daily", "BB", f"{BB}/exchangerate", min_value=30, max_value=250, max_step=10),
    S("fx.rate.usd.history", "forex", "USD/BDT annual history", "bdt", "annual", "BB",
      "https://www.bb.org.bd/econdata/time_series_data1972-2024.xlsx",
      "Annual USD/BDT exchange rate, 1972-2024, from Bangladesh Bank's historical workbook.", min_value=5, max_value=300, max_step=50),

    # ---- Reserves & remittances ------------------------------------------
    S("reserves.gross", "external", "Gross foreign exchange reserves", "usd_mn", "monthly", "BB",
      f"{BB}/intreserve", "Total international reserves of Bangladesh (gross), USD million.", min_value=0, max_value=100000, max_step=10000),
    S("reserves.bpm6", "external", "FX reserves (BPM6)", "usd_mn", "monthly", "BB",
      f"{BB}/intreserve", "Foreign exchange reserves on the BPM6 basis, USD million.", min_value=0, max_value=100000, max_step=10000),
    S("remittances.total.usd", "external", "Workers' remittances", "usd_mn", "monthly", "BB",
      f"{BB}/wageremitance", "Monthly workers' remittance inflow, USD million.", min_value=0, max_value=10000, max_step=3000),
    S("remittances.total.bdt", "external", "Workers' remittances (BDT)", "bdt_bn", "monthly", "BB",
      f"{BB}/wageremitance", "Monthly workers' remittance inflow, BDT billion.", min_value=0, max_value=1000, max_step=400),

    # ---- Policy & money-market rates -------------------------------------
    S("rates.policy", "rates", "Policy repo rate", "percent", "irregular", "BB",
      "https://www.bb.org.bd/en/index.php/monetaryactivity/monetarypolicy", "Bangladesh Bank policy repo rate.", min_value=0, max_value=20, max_step=3),
    S("rates.slf", "rates", "Standing Lending Facility rate", "percent", "irregular", "BB",
      "https://www.bb.org.bd/en/index.php/monetaryactivity/monetarypolicy", min_value=0, max_value=25, max_step=3),
    S("rates.sdf", "rates", "Standing Deposit Facility rate", "percent", "irregular", "BB",
      "https://www.bb.org.bd/en/index.php/monetaryactivity/monetarypolicy", min_value=0, max_value=20, max_step=3),
    S("rates.bank", "rates", "Bank rate", "percent", "monthly", "BB", f"{BB}/intrate", min_value=0, max_value=15, max_step=3),
    S("rates.call_money", "rates", "Weighted average call money rate", "percent", "monthly", "BB",
      f"{BB}/intrate", "Weighted average call money market borrowing rate.", min_value=0, max_value=30, max_step=8),
    S("rates.deposit", "rates", "Scheduled banks deposit rate", "percent", "monthly", "BB",
      f"{BB}/intrate", "Weighted average interest rate on deposits of scheduled banks.", min_value=0, max_value=20, max_step=3),
    S("rates.lending", "rates", "Scheduled banks lending rate", "percent", "monthly", "BB",
      f"{BB}/intrate", "Weighted average lending rate of scheduled banks.", min_value=0, max_value=30, max_step=3),
    S("rates.spread", "rates", "Interest rate spread", "percent", "monthly", "BB",
      f"{BB}/intrate", "Lending rate minus deposit rate.", min_value=-5, max_value=15, max_step=3),
    S("rates.tbill.14d", "rates", "14-day T-bill cut-off yield", "percent", "irregular", "BB",
      "https://www.bb.org.bd/en/index.php/monetaryactivity/treasury", min_value=0, max_value=30, max_step=5),
    S("rates.tbill.91d", "rates", "91-day T-bill cut-off yield", "percent", "irregular", "BB",
      "https://www.bb.org.bd/en/index.php/monetaryactivity/treasury", min_value=0, max_value=30, max_step=5),
    S("rates.tbill.182d", "rates", "182-day T-bill cut-off yield", "percent", "irregular", "BB",
      "https://www.bb.org.bd/en/index.php/monetaryactivity/treasury", min_value=0, max_value=30, max_step=5),
    S("rates.tbill.364d", "rates", "364-day T-bill cut-off yield", "percent", "irregular", "BB",
      "https://www.bb.org.bd/en/index.php/monetaryactivity/treasury", min_value=0, max_value=30, max_step=5),
    S("rates.tbond.2y", "rates", "2-year T-bond cut-off yield", "percent", "irregular", "BB",
      "https://www.bb.org.bd/en/index.php/monetaryactivity/treasury", min_value=0, max_value=30, max_step=5),
    S("rates.tbond.5y", "rates", "5-year T-bond cut-off yield", "percent", "irregular", "BB",
      "https://www.bb.org.bd/en/index.php/monetaryactivity/treasury", min_value=0, max_value=30, max_step=5),
    S("rates.tbond.10y", "rates", "10-year T-bond cut-off yield", "percent", "irregular", "BB",
      "https://www.bb.org.bd/en/index.php/monetaryactivity/treasury", min_value=0, max_value=30, max_step=5),
    S("rates.tbond.15y", "rates", "15-year T-bond cut-off yield", "percent", "irregular", "BB",
      "https://www.bb.org.bd/en/index.php/monetaryactivity/treasury", min_value=0, max_value=30, max_step=5),
    S("rates.tbond.20y", "rates", "20-year T-bond cut-off yield", "percent", "irregular", "BB",
      "https://www.bb.org.bd/en/index.php/monetaryactivity/treasury", min_value=0, max_value=30, max_step=5),

    # ---- Money & credit ---------------------------------------------------
    S("monetary.m1", "monetary", "Narrow money (M1)", "bdt_bn", "monthly", "BB",
      f"{BB}/moneysupply", "Currency outside banks plus demand deposits plus BB deposits of FIs.", min_value=0, max_value=100000, max_step=20000),
    S("monetary.m2", "monetary", "Broad money (M2)", "bdt_bn", "monthly", "BB",
      f"{BB}/moneysupply", "M1 plus time deposits with DMBs.", min_value=0, max_value=300000, max_step=30000),
    S("monetary.currency_outside_banks", "monetary", "Currency outside banks", "bdt_bn", "monthly", "BB",
      f"{BB}/moneysupply", min_value=0, max_value=100000, max_step=20000),
    S("monetary.private_credit", "monetary", "Private-sector credit", "bdt_bn", "monthly", "BB",
      f"{BB}/bankdeposit", min_value=0, max_value=300000, max_step=30000),

    # ---- Inflation --------------------------------------------------------
    S("inflation.cpi.national", "inflation", "CPI (national, all items)", "index", "monthly", "BBS",
      BBS_CPI, "Consumer Price Index, national, all items (base 2021-22=100).", min_value=0, max_value=1000, max_step=50),
    S("inflation.cpi.national.yoy", "inflation", "CPI inflation (national, YoY)", "percent", "monthly", "BBS",
      BBS_CPI, "Point-to-point national CPI inflation.", min_value=-20, max_value=50, max_step=10),
    S("inflation.cpi.national.12m_avg", "inflation", "CPI inflation (12-month average)", "percent", "monthly", "BBS",
      BBS_CPI, min_value=-20, max_value=50, max_step=10),
    S("inflation.cpi.food", "inflation", "CPI food (national)", "index", "monthly", "BBS", BBS_CPI, min_value=0, max_value=1000, max_step=50),
    S("inflation.cpi.food.yoy", "inflation", "Food inflation (national, YoY)", "percent", "monthly", "BBS", BBS_CPI, min_value=-30, max_value=60, max_step=15),
    S("inflation.cpi.non_food", "inflation", "CPI non-food (national)", "index", "monthly", "BBS", BBS_CPI, min_value=0, max_value=1000, max_step=50),
    S("inflation.cpi.non_food.yoy", "inflation", "Non-food inflation (national, YoY)", "percent", "monthly", "BBS", BBS_CPI, min_value=-30, max_value=60, max_step=15),

    # ---- GDP --------------------------------------------------------------
    S("gdp.current.market_price", "real", "GDP at current market prices", "bdt_bn", "annual", "BBS", BBS_GDP,
      "Nominal GDP at current market prices, BDT billion.", min_value=0, max_value=100000, max_step=30000),
    S("gdp.constant.market_price", "real", "GDP at constant market prices", "bdt_bn", "annual", "BBS", BBS_GDP,
      "Real GDP at constant market prices, BDT billion.", min_value=0, max_value=100000, max_step=30000),
    S("gdp.growth.constant", "real", "Real GDP growth", "percent", "annual", "BBS", BBS_GDP, min_value=-10, max_value=20, max_step=10),

    # ---- Fiscal (NBR) -----------------------------------------------------
    S("fiscal.nbr.total", "fiscal", "NBR tax revenue", "bdt_crore", "monthly", "NBR", NBR,
      "Total tax revenue collected by the National Board of Revenue.", min_value=0, max_value=1000000, max_step=200000),
    S("fiscal.nbr.customs", "fiscal", "Customs duty", "bdt_crore", "monthly", "NBR", NBR, min_value=0, max_value=100000, max_step=30000),
    S("fiscal.nbr.vat", "fiscal", "VAT", "bdt_crore", "monthly", "NBR", NBR, min_value=0, max_value=500000, max_step=100000),
    S("fiscal.nbr.income_tax", "fiscal", "Income tax", "bdt_crore", "monthly", "NBR", NBR, min_value=0, max_value=500000, max_step=100000),

    # ---- DSE --------------------------------------------------------------
    S("market.dse.index.dsex", "market", "DSEX broad index", "index", "daily", "DSE", DSE, min_value=1000, max_value=15000, max_step=500),
    S("market.dse.index.ds30", "market", "DS30 blue-chip index", "index", "daily", "DSE", DSE, min_value=500, max_value=5000, max_step=300),
    S("market.dse.index.dses", "market", "DSES Shariah index", "index", "daily", "DSE", DSE, min_value=300, max_value=3000, max_step=200),
    S("market.dse.turnover", "market", "DSE turnover", "bdt_mn", "daily", "DSE", DSE, min_value=0, max_value=100000, max_step=50000),
    S("market.dse.volume", "market", "DSE volume", "shares", "daily", "DSE", DSE, min_value=0, max_value=2_000_000_000, max_step=1_000_000_000),
    S("market.dse.trades", "market", "DSE trades", "count", "daily", "DSE", DSE, min_value=0, max_value=1_000_000, max_step=500_000),
    S("market.dse.market_cap.total", "market", "DSE total market capitalisation", "bdt_bn", "daily", "DSE", DSE, min_value=0, max_value=100000, max_step=20000),

    # ---- Payments ---------------------------------------------------------
    S("payments.mfs.accounts", "payments", "MFS accounts", "count", "monthly", "BB", f"{BB}/index", min_value=0, max_value=500_000_000, max_step=50_000_000),
    S("payments.mfs.transactions.value", "payments", "MFS transaction value", "bdt_mn", "monthly", "BB", f"{BB}/index", min_value=0, max_value=5_000_000, max_step=1_000_000),
    S("payments.cards.issued", "payments", "Cards issued", "count", "monthly", "BB", f"{BB}/index", min_value=0, max_value=100_000_000, max_step=10_000_000),
    S("payments.internet_banking.customers", "payments", "Internet banking customers", "count", "monthly", "BB", f"{BB}/index", min_value=0, max_value=100_000_000, max_step=10_000_000),

    # ---- Telecom / social -------------------------------------------------
    S("social.mobile.subscribers", "social", "Mobile subscribers", "count", "monthly", "BTRC", BTRC, min_value=0, max_value=300_000_000, max_step=20_000_000),
    S("social.internet.subscribers", "social", "Internet subscribers", "count", "monthly", "BTRC", BTRC, min_value=0, max_value=200_000_000, max_step=20_000_000),
    S("social.broadband.subscribers", "social", "Broadband subscribers", "count", "monthly", "BTRC", BTRC, min_value=0, max_value=50_000_000, max_step=5_000_000),

    # ---- Energy / commodities --------------------------------------------
    S("commodities.gold", "commodities", "Gold price (London)", "usd", "monthly", "BB", "https://www.bb.org.bd/en/index.php/econdata/index", min_value=0, max_value=10000, max_step=1000),
    S("commodities.brent", "commodities", "Brent crude oil", "usd", "monthly", "BB", "https://www.bb.org.bd/en/index.php/econdata/index", min_value=0, max_value=300, max_step=50),
    S("commodities.dubai_crude", "commodities", "Dubai crude oil", "usd", "monthly", "BB", "https://www.bb.org.bd/en/index.php/econdata/index", min_value=0, max_value=300, max_step=50),
]


def as_rows() -> list[dict]:
    return CORE


def ensure_series(rows: list[dict]) -> int:
    """Upsert ad-hoc catalog rows (jobs with publisher-defined tables).

    This is intentionally explicit and idempotent: a dynamic family (CPI groups,
    payment tables, DSE indices) must publish names/units before its observations
    can pass the framework's "not in catalog" gate.
    """
    import json

    from app import db

    n = 0
    with db.connection() as conn:
        with conn.cursor() as cur:
            for s in rows:
                cur.execute(
                    """
                    INSERT INTO series
                        (id, module, name, description, unit, frequency, source, source_url,
                         dimensions, min_value, max_value, max_step, tier)
                    VALUES (%(id)s,%(module)s,%(name)s,%(description)s,%(unit)s,%(frequency)s,
                            %(source)s,%(source_url)s,%(dimensions)s::jsonb,%(min_value)s,
                            %(max_value)s,%(max_step)s,%(tier)s)
                    ON CONFLICT (id) DO UPDATE SET
                        module=EXCLUDED.module, name=EXCLUDED.name,
                        description=EXCLUDED.description, unit=EXCLUDED.unit,
                        frequency=EXCLUDED.frequency, source=EXCLUDED.source,
                        source_url=EXCLUDED.source_url, is_active=true
                    """,
                    {**s, "dimensions": json.dumps(s.get("dimensions") or {})},
                )
                n += 1
    return n
