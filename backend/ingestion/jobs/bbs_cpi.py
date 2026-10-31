"""BBS monthly CPI release (national, rural, urban, WRI) from the official workbook.

BBS publishes one XLSX per monthly release on its legacy `site/page` hub, with
UUID-named files on Oracle Object Storage. The landing page is the discovery
layer; the workbook is the data layer. We resolve the newest workbook by
downloading the recent XLSX links and checking the sheet names, so a UUID change
never breaks the job.
"""
from __future__ import annotations

import io
import re
from datetime import date

import openpyxl
from bs4 import BeautifulSoup

from ingestion import http_client
from ingestion.bb_tables import _parse_period, slugify
from ingestion.catalog import ensure_series
from ingestion.framework import FetchedFile, IngestionJob, Record

LANDING = "https://bbs.gov.bd/site/page/29b379ff-7bac-41d9-b321-e41929bab4a1/CPI-and-QIIP"
SOURCE_URL = LANDING

# label in BBS table -> catalog id for the national all-items series
_CPI_LABELS = {
    "general index": ("inflation.cpi.national", "CPI (national, all items)"),
    "food": ("inflation.cpi.food", "CPI food (national)"),
    "non-food": ("inflation.cpi.non_food", "CPI non-food (national)"),
}
_CPI_INFLATION = {
    "inflation (point to point)": ".yoy",
    "inflation (over previous month)": ".mom",
}


def _date_for_header(cell: str) -> date | None:
    s = str(cell or "").strip().replace("’", "'")
    m = re.match(r"([A-Za-z]{3})[a-z]*\s*'?\s*(\d{2,4})", s)
    if m:
        from datetime import datetime
        month = datetime.strptime(m.group(1), "%b").month
        y = int(m.group(2))
        if y < 100:
            y += 2000
        return date(y, month, 1)
    m = re.match(r"(\d{4})\s*-\s*(\d{2,4})", s)
    if m:
        y = int(m.group(2))
        if y < 100:
            y += 2000
        return date(y, 6, 30)
    return None


def _parse_cpi_sheet(ws) -> list[Record]:
    # Month labels live in row 5 (1-based); annual headings are rows 3-4.
    # Prefer the month label when both apply to the same column.
    header_rows = [5, 4, 3]
    max_col = min(ws.max_column, 20)
    dates: dict[int, date] = {}
    for c in range(1, max_col + 1):
        d = None
        for r in header_rows:
            d = _date_for_header(ws.cell(r, c).value)
            if d:
                break
        if d:
            dates[c] = d
    out: list[Record] = []
    # Track the last classification label so "Inflation" rows under a group
    # inherit the group's id.
    current = None
    for r in range(6, ws.max_row + 1):
        label = str(ws.cell(r, 1).value or "").strip().lower()
        if not label:
            continue
        if label in _CPI_LABELS:
            current = _CPI_LABELS[label]
            sid = current[0]
        elif label.startswith("inflation") and current:
            # A food/non-food inflation row follows its index row. Strip any
            # suffix left by a previous inflation row so Food gets food.yoy,
            # not national.yoy.
            base = re.sub(r"\.(yoy|mom)$", "", current[0])
            sid = base + _CPI_INFLATION.get(label, ".yoy")
        else:
            current = None
            continue
        for c, d in dates.items():
            v = ws.cell(r, c).value
            if isinstance(v, (int, float)):
                out.append(Record(sid, d, float(v)))
    return out


def _parse_historical(ws) -> list[Record]:
    # Year | General | Food | Non-food | General inflation | Food | Non-food
    out: list[Record] = []
    for r in range(5, ws.max_row + 1):
        raw = ws.cell(r, 1).value
        d, kind = _parse_period(raw, {})
        if d is None or kind != "annual":
            continue
        for c, sid in ((2, "inflation.cpi.national.long"),
                       (3, "inflation.cpi.food.long"),
                       (4, "inflation.cpi.non_food.long"),
                       (5, "inflation.cpi.national.yoy.long"),
                       (6, "inflation.cpi.food.yoy.long"),
                       (7, "inflation.cpi.non_food.yoy.long")):
            v = ws.cell(r, c).value
            if isinstance(v, (int, float)):
                out.append(Record(sid, d, float(v)))
    return out


def _parse_wri_sheet(ws, division: str) -> tuple[list[dict], list[Record]]:
    """WRI sheets: Sector | annual | ... | latest months; rows repeat index/change."""
    max_col = min(ws.max_column, 18)
    dates: dict[int, date] = {}
    for c in range(1, max_col + 1):
        d = _date_for_header(ws.cell(3, c).value)
        if d:
            dates[c] = d
    cat: list[dict] = []
    recs: list[Record] = []
    current = None
    for r in range(4, ws.max_row + 1):
        label = str(ws.cell(r, 1).value or "").strip()
        if not label:
            continue
        low = label.lower()
        if low.startswith("percentage change"):
            if not current:
                continue
            sid = current + ".change"
            cat.append({
                "id": sid, "module": "social", "name": f"WRI {division.title()} — {label}",
                "description": f"BBS Wage Rate Index change, {division.title()} — {label}.",
                "unit": "percent", "frequency": "monthly", "source": "BBS",
                "source_url": SOURCE_URL, "dimensions": {},
                "min_value": -50, "max_value": 100, "max_step": 25, "tier": "basic",
            })
        else:
            slug = slugify(re.sub(r"^[IVX.0-9]+\s*", "", label))
            sid = f"social.wri.{division}.{slug}"
            current = sid
            cat.append({
                "id": sid, "module": "social", "name": f"WRI {division.title()} — {label}",
                "description": f"BBS Wage Rate Index, {division.title()} — {label}.",
                "unit": "index", "frequency": "monthly", "source": "BBS",
                "source_url": SOURCE_URL, "dimensions": {},
                "min_value": 0, "max_value": 10000, "max_step": 500, "tier": "basic",
            })
        for c, d in dates.items():
            v = ws.cell(r, c).value
            if isinstance(v, (int, float)):
                recs.append(Record(sid, d, float(v)))
    return cat, recs


class BbsCpiJob(IngestionJob):
    name = "bbs_cpi"
    source = "BBS"

    def fetch(self, backfill: bool = False) -> list[FetchedFile]:
        html = http_client.get(LANDING, timeout=60).text
        soup = BeautifulSoup(html, "lxml")
        links = []
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if href.lower().endswith(".xlsx") and "office-bbs" in href:
                links.append(href)
        # Newest first; the page interleaves 2025 and 2026 release files.
        def release_key(u: str) -> tuple[int, int]:
            m = re.search(r"/office-bbs/(\d{4})/(\d{1,2})/", u)
            return (int(m.group(1)), int(m.group(2))) if m else (0, 0)

        links = sorted(dict.fromkeys(links), key=release_key, reverse=True)
        for url in links[:20]:
            try:
                content = http_client.get(url, timeout=90).content
                wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
                has = any("CPI_National" in n for n in wb.sheetnames)
                wb.close()
                if has:
                    return [FetchedFile("bbs_cpi.xlsx", content, date.today())]
            except Exception:
                continue
        return []

    def parse(self, f: FetchedFile) -> list[Record]:
        wb = openpyxl.load_workbook(io.BytesIO(f.content), data_only=True)
        out: list[Record] = []
        dynamic: list[dict] = []
        for name in wb.sheetnames:
            ws = wb[name]
            if name == "Table-1.3_CPI_National":
                out += _parse_cpi_sheet(ws)
            elif "Historical Data_CPI" in name:
                out += _parse_historical(ws)
            elif name.startswith("Table-2.") and "WRI" in name:
                division = name.split("_")[-1].replace("WRI", "").strip() or "national"
                if division.lower() == "national":
                    division = "national"
                cat, recs = _parse_wri_sheet(ws, division.lower().replace(" ", "_"))
                dynamic += cat
                out += recs
        wb.close()
        if dynamic:
            ensure_series(dynamic)
        # Historical long inflation inflation IDs are not in the BB catalog.
        ensure_series([
            {"id": "inflation.cpi.national.mom", "module": "inflation", "name": "CPI inflation (national, MoM)",
             "description": "Month-on-month national CPI inflation.", "unit": "percent", "frequency": "monthly",
             "source": "BBS", "source_url": SOURCE_URL, "dimensions": {}, "min_value": -20, "max_value": 50,
             "max_step": 10, "tier": "basic"},
            {"id": "inflation.cpi.national.yoy.long", "module": "inflation", "name": "CPI inflation (national, YoY, long)",
             "description": "Annual national CPI inflation from BBS historical series.", "unit": "percent",
             "frequency": "annual", "source": "BBS", "source_url": SOURCE_URL, "dimensions": {},
             "min_value": -50, "max_value": 100, "max_step": 50, "tier": "basic"},
            {"id": "inflation.cpi.food.yoy.long", "module": "inflation", "name": "Food inflation (long)",
             "description": "Annual food CPI inflation from BBS historical series.", "unit": "percent",
             "frequency": "annual", "source": "BBS", "source_url": SOURCE_URL, "dimensions": {},
             "min_value": -50, "max_value": 100, "max_step": 50, "tier": "basic"},
            {"id": "inflation.cpi.non_food.yoy.long", "module": "inflation", "name": "Non-food inflation (long)",
             "description": "Annual non-food CPI inflation from BBS historical series.", "unit": "percent",
             "frequency": "annual", "source": "BBS", "source_url": SOURCE_URL, "dimensions": {},
             "min_value": -50, "max_value": 100, "max_step": 50, "tier": "basic"},
            {"id": "inflation.cpi.non_food.long", "module": "inflation", "name": "CPI non-food (long)",
             "description": "Annual non-food CPI index from BBS historical series.", "unit": "index",
             "frequency": "annual", "source": "BBS", "source_url": SOURCE_URL, "dimensions": {},
             "min_value": 0, "max_value": 10000, "max_step": 1000, "tier": "basic"},
            {"id": "inflation.cpi.food.long", "module": "inflation", "name": "CPI food (long)",
             "description": "Annual food CPI index from BBS historical series.", "unit": "index",
             "frequency": "annual", "source": "BBS", "source_url": SOURCE_URL, "dimensions": {},
             "min_value": 0, "max_value": 10000, "max_step": 1000, "tier": "basic"},
            {"id": "inflation.cpi.food.mom", "module": "inflation", "name": "Food inflation (MoM)",
             "description": "Month-on-month food CPI inflation.", "unit": "percent", "frequency": "monthly",
             "source": "BBS", "source_url": SOURCE_URL, "dimensions": {}, "min_value": -30,
             "max_value": 50, "max_step": 15, "tier": "basic"},
            {"id": "inflation.cpi.non_food.mom", "module": "inflation", "name": "Non-food inflation (MoM)",
             "description": "Month-on-month non-food CPI inflation.", "unit": "percent", "frequency": "monthly",
             "source": "BBS", "source_url": SOURCE_URL, "dimensions": {}, "min_value": -30,
             "max_value": 50, "max_step": 15, "tier": "basic"},
        ])
        return out
