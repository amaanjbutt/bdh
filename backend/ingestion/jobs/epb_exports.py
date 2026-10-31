"""EPB monthly/quarterly export summary workbook.

One small XLSX per release lists every product line with the previous fiscal
year, fiscal-year-to-date, and latest month. We publish each product as a
`trade.exports.*` series in USD million.
"""
from __future__ import annotations

import io
import re
from datetime import date, datetime

import openpyxl
from bs4 import BeautifulSoup

from ingestion import http_client
from ingestion.bb_tables import _num, clean_label, slugify
from ingestion.catalog import ensure_series
from ingestion.framework import FetchedFile, IngestionJob, Record

LANDING = "https://epb.gov.bd/views/epb-export-data"


class EpbExportsJob(IngestionJob):
    name = "epb_exports"
    source = "EPB"

    def fetch(self, backfill: bool = False) -> list[FetchedFile]:
        html = http_client.get(LANDING, timeout=60).text
        soup = BeautifulSoup(html, "lxml")
        links = [a["href"] for a in soup.find_all("a", href=True)
                 if a["href"].lower().endswith(".xlsx") and "office-epb" in a["href"]]
        for url in list(dict.fromkeys(links))[:12]:
            try:
                content = http_client.get(url, timeout=90).content
                wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
                ws = wb.worksheets[0]
                title = " ".join(str(ws.cell(r, 1).value or "") for r in (1, 2, 3)).lower()
                wb.close()
                if "summary" in title and "export" in title:
                    return [FetchedFile("epb_exports.xlsx", content, date.today())]
            except Exception:
                continue
        return []

    def parse(self, f: FetchedFile) -> list[Record]:
        wb = openpyxl.load_workbook(io.BytesIO(f.content), data_only=True)
        ws = wb.worksheets[0]
        out: list[Record] = []
        dynamic: dict[str, dict] = {}

        # Header: "Period: July-September 2026-2027" and "Value in Million US$".
        period = " ".join(str(ws.cell(r, 1).value or "") for r in range(1, 6))
        m = re.search(r"([A-Za-z]+)\s*-\s*([A-Za-z]+)\s+(\d{4})-(\d{2,4})", period)
        if not m:
            wb.close()
            raise ValueError(f"EPB summary period not found in: {period[:160]!r}")
        end_month = datetime.strptime(m.group(2)[:3].title(), "%b").month
        fy_start = int(m.group(3))
        fy_end = int(m.group(4))
        if fy_end < 100:
            fy_end += 2000

        def month_end(year: int, month: int) -> date:
            nxt = date(year + (month == 12), month % 12 + 1, 1)
            return date.fromordinal(nxt.toordinal() - 1)

        ytd_date = month_end(fy_start, end_month)
        prev_ytd = month_end(fy_start - 1, end_month)
        prev_fy = date(fy_start - 1, 6, 30)
        prev_month = month_end(fy_start - (end_month == 1), (end_month - 2) % 12 + 1)

        # Column -> (series suffix, observation date). Column 2 is the previous full
        # fiscal year; 3/4 are fiscal-year-to-date; 6/7/9 are monthly.
        columns = (
            (2, "", prev_fy),
            (3, ".ytd", ytd_date),
            (4, ".ytd", prev_ytd),
            (6, ".monthly", ytd_date),
            (7, ".monthly", prev_month),
            (9, ".monthly", prev_ytd),
        )
        for r in range(7, ws.max_row + 1):
            label = clean_label(ws.cell(r, 1).value)
            if not label or label.lower().startswith("all products") or label.lower() == "products" or label.isdigit():
                continue
            display = label
            for _ in range(3):
                display = re.sub(r"^(?:[A-Z]\.|\(\d+\)|[a-z]\)|[IVX]+\.)\s*", "", display)
            display = display.strip()
            if not display:
                continue
            slug = slugify(label)
            for col, suffix, obs_date in columns:
                v = _num(ws.cell(r, col).value)
                if v is None:
                    continue
                sid = f"trade.exports.{slug}{suffix}"
                if sid not in dynamic:
                    qualifier = (" (FY-to-date)" if suffix == ".ytd"
                                 else " (monthly)" if suffix == ".monthly"
                                 else " (full fiscal year)")
                    dynamic[sid] = {
                        "id": sid, "module": "external", "name": f"Exports — {display}{qualifier}",
                        "description": f"EPB export receipts: {label} ({qualifier.strip(' ()')}), USD million.",
                        "unit": "usd_mn", "frequency": "monthly", "source": "EPB",
                        "source_url": LANDING, "dimensions": {}, "min_value": 0,
                        "max_value": 100_000, "max_step": 20_000, "tier": "basic",
                    }
                out.append(Record(sid, obs_date, v))
        wb.close()
        if dynamic:
            ensure_series(list(dynamic.values()))
        return out
