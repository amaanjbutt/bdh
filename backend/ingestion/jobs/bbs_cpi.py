"""BBS monthly CPI release (national, rural, urban, WRI) from the official workbook.

BBS publishes a dated table of links to the monthly releases. Each workbook
contains separate national, rural and urban tables, plus wage statistics.
"""
from __future__ import annotations

import io
import re
from calendar import month_name, monthrange
from datetime import date, datetime
from hashlib import sha256
from urllib.parse import urljoin, urlsplit

import openpyxl
from bs4 import BeautifulSoup

from ingestion import http_client
from ingestion.bb_tables import _parse_period, slugify
from ingestion.catalog import ensure_series
from ingestion.framework import FetchedFile, IngestionJob, Record

LANDING = "https://bbs.gov.bd/pages/static-pages/6922de7a933eb65569e1ae8f"
SOURCE_URL = LANDING
_MONTHS = {name.lower(): i for i, name in enumerate(month_name) if i}

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
        try:
            month = datetime.strptime(m.group(1), "%b").month
        except ValueError:
            return None
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


def _parse_cpi_sheet(ws, area: str = "national", group_names: dict[str, str] | None = None) -> list[Record]:
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
    base = None
    for r in range(6, ws.max_row + 1):
        raw = " ".join(str(ws.cell(r, 1).value or "").split())
        label = raw.lower()
        if not label:
            continue
        if label in _CPI_LABELS:
            base = _CPI_LABELS[label][0]
            if area != "national":
                item = base.rsplit(".", 1)[-1]
                base = f"inflation.cpi.{area}" + (f".{item}" if item != "national" else "")
            sid = base
        elif group_names is not None and (group := re.fullmatch(r"(0[1-9]|1[0-2])\.\s*(.+)", raw)):
            base = sid = f"inflation.cpi.{area}.coicop.{group[1]}"
            group_names[base] = group[2]
        elif label in _CPI_INFLATION and base:
            sid = base + _CPI_INFLATION[label]
        else:
            base = None
            continue
        monthly_only = area != "national" or ".coicop." in sid
        for c, d in dates.items():
            if monthly_only:
                if d.day != 1:
                    continue
                d = d.replace(day=monthrange(d.year, d.month)[1])
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
        html = http_client.get(LANDING, timeout=90, retry_transient=True).text
        releases = _cpi_releases(html)
        periods = sorted(period for period in releases if period <= date.today())
        if not periods:
            raise ValueError("No dated BBS CPI workbooks found")
        files = []
        for when in periods[-(12 if backfill else 1):]:
            try:
                content = http_client.get(releases[when], timeout=90, retry_transient=True).content
            except Exception:
                if not backfill:
                    raise
                self.fetch_warnings.append(f"BBS CPI workbook for {when} could not be downloaded")
                continue
            digest = sha256(content).hexdigest()[:12]
            files.append(FetchedFile(f"bbs_cpi_{when}_{digest}.xlsx", content, when))
        return files

    def parse(self, f: FetchedFile) -> list[Record]:
        wb = openpyxl.load_workbook(io.BytesIO(f.content), data_only=True)
        out: list[Record] = []
        dynamic: list[dict] = []
        national: list[Record] = []
        group_names: dict[str, str] = {}
        for name in wb.sheetnames:
            ws = wb[name]
            if name == "Table-1.3_CPI_National":
                national = _parse_cpi_sheet(ws, group_names=group_names)
                out += national
            elif name in {"Table-1.4_CPI_Rural", "Table-1.5_CPI_Urban"}:
                area = name.rsplit("_", 1)[-1].lower()
                out += _parse_cpi_sheet(ws, area, group_names)
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
        if not national or (f.filename.startswith("bbs_cpi_") and not any(
            r.series_id == "inflation.cpi.national.yoy" and r.obs_date == f.when.replace(day=1)
            for r in national
        )):
            raise ValueError(f"BBS CPI workbook did not contain the expected national release for {f.when}")
        dynamic.extend(_area_series(sid, group_names) for sid in sorted({
            r.series_id for r in out
            if ".coicop." in r.series_id or r.series_id.startswith(("inflation.cpi.rural", "inflation.cpi.urban"))
        }))
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


def _cpi_releases(html: str) -> dict[date, str]:
    releases = {}
    for table in BeautifulSoup(html, "lxml").find_all("table"):
        rows = table.find_all("tr")
        if not rows:
            continue
        headings = [cell.get_text(strip=True).lower() for cell in rows[0].find_all(["td", "th"])]
        columns = [(i, int(year[1])) for i, heading in enumerate(headings[:-2])
                   if (year := re.fullmatch(r"year\s*-?\s*(\d{4})", heading))
                   and headings[i + 2] == "excel"]
        for row in rows[1:]:
            cells = row.find_all(["td", "th"])
            for i, year in columns:
                if i + 2 >= len(cells):
                    continue
                month = _MONTHS.get(cells[i].get_text(strip=True).lower())
                link = cells[i + 2].find("a", href=True)
                if month and link:
                    url = urljoin(LANDING, link["href"])
                    if urlsplit(url).path.lower().endswith(".xlsx"):
                        releases[date(year, month, monthrange(year, month)[1])] = url
    return releases


def _area_series(sid: str, group_names: dict[str, str]) -> dict:
    area, *parts = sid.removeprefix("inflation.cpi.").split(".")
    change = parts and parts[-1] in {"yoy", "mom"}
    item = parts[0].replace("_", "-") if parts and parts[0] in {"food", "non_food"} else "all items"
    if parts and parts[0] == "coicop":
        item = group_names[".".join(sid.split(".")[:5])]
    measure = {"yoy": "inflation YoY", "mom": "inflation MoM"}[parts[-1]] if change else "index"
    name = f"CPI {measure} ({area}, {item})"
    return {
        "id": sid, "module": "inflation", "name": name,
        "description": f"BBS {name}, 2021–22 base.", "unit": "percent" if change else "index",
        "frequency": "monthly", "source": "BBS", "source_url": SOURCE_URL, "dimensions": {},
        "min_value": -50 if change else 0, "max_value": 100 if change else 10000,
        "max_step": None, "tier": "basic",
    }
