"""Derived layer: labelled transformations of official series.

Every output carries `source='BanglaDataHub'` and a `derivation` JSON on its
catalog row, so a user can tell an official number from our arithmetic.
"""
from __future__ import annotations

from datetime import date

from app import db
from ingestion.catalog import ensure_series
from ingestion.framework import IngestionJob, Record

SOURCE = "BanglaDataHub"


def _series(sid: str) -> dict[date, float]:
    rows = db.query(
        "SELECT obs_date, value FROM observations WHERE series_id=%s AND value IS NOT NULL "
        "ORDER BY obs_date", (sid,),
    )
    return {r["obs_date"]: float(r["value"]) for r in rows}


def _yoy(points: dict[date, float]) -> dict[date, float]:
    out = {}
    for d, v in points.items():
        target = date(d.year - 1, d.month, 1)
        prev = points.get(target)
        if prev is None:
            # Daily series: prefer the same calendar date last year, then the
            # nearest observation within a week (holidays/weekends).
            try:
                prev = points.get(date(d.year - 1, d.month, d.day))
            except ValueError:
                prev = None
            if prev is None:
                candidates = [(abs((x - target).days), x) for x in points
                              if x.year == d.year - 1 and abs((x - target).days) <= 7]
                prev = points[min(candidates)[1]] if candidates else None
        if prev and prev != 0:
            out[d] = (v / prev - 1) * 100
    return out


class DeriveIndicatorsJob(IngestionJob):
    name = "derive_indicators"
    source = SOURCE

    def fetch(self, backfill: bool = False):
        # Pure DB derivation; no external fetch.
        from ingestion.framework import FetchedFile
        return [FetchedFile("derive.json", b"{}", date.today())]

    def parse(self, f) -> list[Record]:
        rows = [
            {"id": "derived.real_call_money", "module": "rates", "name": "Real call-money rate",
             "description": "Weighted-average call-money rate minus national CPI inflation (YoY).",
             "unit": "percent", "frequency": "monthly", "source": SOURCE,
             "source_url": "", "dimensions": {},
             "min_value": -50, "max_value": 50, "max_step": 20, "tier": "basic",
             "derivation": {"method": "call_money - cpi_yoy",
                            "inputs": ["rates.call_money", "inflation.cpi.national.yoy"],
                            "version": 1}},
            {"id": "derived.real_m2_growth", "module": "monetary", "name": "Real broad-money growth",
             "description": "YoY growth of M2 minus national CPI inflation (YoY).",
             "unit": "percent", "frequency": "monthly", "source": SOURCE,
             "source_url": "", "dimensions": {},
             "min_value": -50, "max_value": 50, "max_step": 20, "tier": "basic",
             "derivation": {"method": "m2_yoy - cpi_yoy", "inputs": ["monetary.m2", "inflation.cpi.national.yoy"],
                            "version": 1}},
            {"id": "derived.remittances_growth_yoy", "module": "external", "name": "Remittance growth (YoY)",
             "description": "Year-on-year growth of monthly workers' remittances in USD.",
             "unit": "percent", "frequency": "monthly", "source": SOURCE,
             "source_url": "", "dimensions": {},
             "min_value": -100, "max_value": 200, "max_step": 100, "tier": "basic",
             "derivation": {"method": "pct_change_12m", "inputs": ["remittances.total.usd"], "version": 1}},
            {"id": "derived.usd_bdt_depreciation_yoy", "module": "forex", "name": "BDT depreciation vs USD (YoY)",
             "description": "Year-on-year change in the USD/BDT rate (positive = taka weaker).",
             "unit": "percent", "frequency": "monthly", "source": SOURCE,
             "source_url": "", "dimensions": {},
             "min_value": -50, "max_value": 100, "max_step": 30, "tier": "basic",
             "derivation": {"method": "pct_change_12m", "inputs": ["fx.rate.usd"], "version": 1}},
        ]
        ensure_series(rows)
        for s in rows:
            db.execute(
                "UPDATE series SET derivation=%s::jsonb WHERE id=%s",
                (__import__("json").dumps(s["derivation"]), s["id"]),
            )
        out: list[Record] = []

        cm = _series("rates.call_money")
        cpi = _series("inflation.cpi.national.yoy")
        for d in sorted(set(cm) & set(cpi)):
            out.append(Record("derived.real_call_money", d, cm[d] - cpi[d]))

        m2 = _series("monetary.m2")
        for d, g in _yoy(m2).items():
            if d in cpi:
                out.append(Record("derived.real_m2_growth", d, g - cpi[d]))

        rem = _series("remittances.total.usd")
        for d, g in _yoy(rem).items():
            out.append(Record("derived.remittances_growth_yoy", d, g))

        fx = _series("fx.rate.usd")
        for d, g in _yoy(fx).items():
            out.append(Record("derived.usd_bdt_depreciation_yoy", d, g))
        return out
