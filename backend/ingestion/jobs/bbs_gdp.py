"""BBS annual GDP release (current and constant prices, per-capita)."""
from __future__ import annotations

import io
import re
from datetime import date

import openpyxl
from bs4 import BeautifulSoup

from ingestion import http_client
from ingestion.catalog import ensure_series
from ingestion.framework import FetchedFile, IngestionJob, Record

LANDING = "https://bbs.gov.bd/site/page/dc2bc6ce-7080-48b3-9a04-73cec782d0df/Gross-Domestic-Product-(GDP)"


def _year(s) -> date | None:
    m = re.match(r"(\d{4})\s*-\s*(\d{2,4})", str(s or ""))
    if not m:
        return None
    y = int(m.group(2))
    if y < 100:
        y += 2000
    return date(y, 6, 30)


class BbsGdpJob(IngestionJob):
    name = "bbs_gdp"
    source = "BBS"

    def fetch(self, backfill: bool = False) -> list[FetchedFile]:
        html = http_client.get(LANDING, timeout=60).text
        soup = BeautifulSoup(html, "lxml")
        links = [a["href"] for a in soup.find_all("a", href=True)
                 if a["href"].lower().endswith(".xlsx") and "office-bbs" in a["href"]]
        for url in list(dict.fromkeys(links))[:10]:
            try:
                content = http_client.get(url, timeout=90).content
                wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
                has = any("Print_GDP" in n for n in wb.sheetnames)
                wb.close()
                if has:
                    return [FetchedFile("bbs_gdp.xlsx", content, date.today())]
            except Exception:
                continue
        return []

    def parse(self, f: FetchedFile) -> list[Record]:
        ensure_series([
            {"id": "gdp.growth.current", "module": "real", "name": "Nominal GDP growth",
             "description": "Annual growth of nominal GDP at current market prices.",
             "unit": "percent", "frequency": "annual", "source": "BBS", "source_url": LANDING,
             "dimensions": {}, "min_value": -20, "max_value": 30, "max_step": 15, "tier": "basic"},
            {"id": "gdp.growth.constant", "module": "real", "name": "Real GDP growth",
             "description": "Annual growth of real GDP at constant market prices.",
             "unit": "percent", "frequency": "annual", "source": "BBS", "source_url": LANDING,
             "dimensions": {}, "min_value": -20, "max_value": 30, "max_step": 15, "tier": "basic"},
            {"id": "gdp.per_capita.bdt", "module": "real", "name": "GDP per capita (BDT)",
             "description": "GDP per capita at current market prices, BDT.",
             "unit": "bdt", "frequency": "annual", "source": "BBS", "source_url": LANDING,
             "dimensions": {}, "min_value": 0, "max_value": 1_000_000, "max_step": 200_000, "tier": "basic"},
            {"id": "gdp.per_capita.usd", "module": "real", "name": "GDP per capita (USD)",
             "description": "GDP per capita at current market prices, USD.",
             "unit": "usd", "frequency": "annual", "source": "BBS", "source_url": LANDING,
             "dimensions": {}, "min_value": 0, "max_value": 20_000, "max_step": 5_000, "tier": "basic"},
        ])
        wb = openpyxl.load_workbook(io.BytesIO(f.content), data_only=True)
        ws = next((wb[n] for n in wb.sheetnames if "Print_GDP" in n), None)
        if ws is None:
            return []
        years = {c: _year(ws.cell(5, c).value) for c in range(1, ws.max_column + 1)}
        years = {c: d for c, d in years.items() if d}
        out: list[Record] = []
        row_map = {
            "gdp at current market price": ("gdp.current.market_price", 1 / 1000.0),
            "gdp at constant market price": ("gdp.constant.market_price", 1 / 1000.0),
            "per capita gdp (in tk.)": ("gdp.per_capita.bdt", 1.0),
            "per capita gdp (in us $)": ("gdp.per_capita.usd", 1.0),
        }
        seen: set[str] = set()
        for r in range(6, ws.max_row + 1):
            label = str(ws.cell(r, 4).value or "").strip().lower()
            label = re.sub(r"\s+", " ", label)
            target = row_map.get(label)
            if not target:
                continue
            sid, scale = target
            if sid in seen:
                continue
            seen.add(sid)
            for c, d in years.items():
                v = ws.cell(r, c).value
                if isinstance(v, (int, float)):
                    out.append(Record(sid, d, float(v) * scale))
            # The growth row immediately follows each GDP level row.
            glabel = str(ws.cell(r + 1, 4).value or "").strip().lower()
            if glabel == "growth rate":
                gid = ("gdp.growth.current" if sid == "gdp.current.market_price"
                       else "gdp.growth.constant" if sid == "gdp.constant.market_price" else None)
                if gid:
                    for c, d in years.items():
                        v = ws.cell(r + 1, c).value
                        if isinstance(v, (int, float)):
                            out.append(Record(gid, d, float(v)))
        wb.close()
        return out
