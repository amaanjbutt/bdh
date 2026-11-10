"""EPB goods exports by product, destination, and HS chapter or heading."""
from __future__ import annotations

import io
import re
from calendar import monthrange
from datetime import date, datetime
from hashlib import sha256
from urllib.parse import urljoin, urlsplit

import openpyxl
from bs4 import BeautifulSoup

from ingestion import http_client
from ingestion.bb_tables import _num, clean_label, slugify
from ingestion.catalog import ensure_series
from ingestion.framework import FetchedFile, IngestionJob, Record

LANDING = "https://epb.gov.bd/pages/epb-export-datas/"
_BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
_BN_MONTHS = {
    "জানুয়ারি": 1, "জানুয়ারি": 1, "ফেব্রুয়ারি": 2, "ফেব্রুয়ারি": 2,
    "মার্চ": 3, "এপ্রিল": 4, "মে": 5, "জুন": 6, "জুলাই": 7,
    "আগস্ট": 8, "অগস্ট": 8, "সেপ্টেম্বর": 9, "অক্টোবর": 10,
    "নভেম্বর": 11, "ডিসেম্বর": 12,
}
_COUNTRY = re.compile(r"^([A-Z]{2}):")
_PRODUCT = re.compile(r"^(\d{2}|\d{4}):\s*(.+)$")


def _month_end(year: int, month: int) -> date:
    return date(year, month, monthrange(year, month)[1])


def _release_period(fiscal_start: int, month: int) -> date:
    return _month_end(fiscal_start + (month < 7), month)


def _workbook_period(sheet) -> tuple[int, date]:
    header = clean_label(sheet["A3"].value)
    match = re.fullmatch(r"Period:\s*July\s*(?:[-–]\s*([A-Za-z]+)\.?\s*)?(\d{4})\s*[-–]\s*(\d{2,4})",
                         header, re.IGNORECASE)
    if match is None:
        raise ValueError(f"EPB release period not recognised: {header!r}")
    start, end = int(match[2]), int(match[3])
    if end not in {start + 1, (start + 1) % 100}:
        raise ValueError(f"Invalid EPB fiscal year: {header!r}")
    month = datetime.strptime((match[1] or "July")[:3].title(), "%b").month
    return start, _release_period(start, month)


def _releases(html: str) -> dict[date, dict[str, str]]:
    releases: dict[date, dict[str, str]] = {}
    for row in BeautifulSoup(html, "lxml").select("tr"):
        year = row.select_one('[data-column="export_data_year"]')
        period = row.select_one('[data-column="epb_export_data_month"]')
        if not year or not period:
            continue
        fiscal = re.match(r"\d{4}", year.get_text(strip=True).translate(_BN_DIGITS))
        month = _BN_MONTHS.get(re.split(r"[-–]", period.get_text(strip=True))[-1].strip())
        if not fiscal or month is None:
            continue
        when = _release_period(int(fiscal[0]), month)
        for link in row.select("a[href][title]"):
            url = urljoin(LANDING, link["href"])
            if not urlsplit(url).path.lower().endswith(".xlsx"):
                continue
            title = link["title"].lower()
            if "summary sheet" in title and "service" not in title:
                releases.setdefault(when, {})["summary"] = url
            elif re.search(r"country[- ]wise export\s*\(goods\)", title):
                releases.setdefault(when, {})["destinations"] = url
    return releases


class EpbExportsJob(IngestionJob):
    name = "epb_exports"
    source = "EPB"

    def fetch(self, backfill: bool = False) -> list[FetchedFile]:
        html = http_client.get(LANDING, timeout=60, retry_transient=True).text
        releases = _releases(html)
        periods = sorted(when for when in releases if when <= date.today())
        if not periods:
            raise ValueError("No dated EPB export releases found")
        files = []
        for when in periods[-(10 if backfill else 1):]:
            attachments = releases[when]
            for kind in ("summary", "destinations"):
                url = attachments.get(kind)
                if not url:
                    self.fetch_warnings.append(f"{when}: EPB {kind} workbook missing")
                    continue
                try:
                    content = http_client.get(url, timeout=90, retry_transient=True).content
                except Exception:
                    self.fetch_warnings.append(f"{when}: EPB {kind} workbook download failed")
                    continue
                digest = sha256(content).hexdigest()[:12]
                files.append(FetchedFile(f"epb_{kind}_{when}_{digest}.xlsx", content, when))
        if not files:
            raise ValueError("No EPB export workbooks could be downloaded")
        return files

    def parse(self, f: FetchedFile) -> list[Record]:
        wb = openpyxl.load_workbook(io.BytesIO(f.content), read_only=True, data_only=True)
        try:
            if f.filename.startswith("epb_destinations_"):
                return self._parse_destinations(wb, f.when)
            summaries = [sheet for sheet in wb.worksheets
                         if "summary sheet" in clean_label(sheet["A2"].value).lower()]
            if len(summaries) != 1:
                raise ValueError("Expected one EPB product summary sheet")
            return self._parse_summary(summaries[0], f.when if f.filename.startswith("epb_summary_") else None)
        finally:
            wb.close()

    @staticmethod
    def _parse_summary(sheet, expected: date | None) -> list[Record]:
        start, when = _workbook_period(sheet)
        if expected is not None and expected != when:
            raise ValueError(f"EPB summary covers {when}, expected {expected}")
        prev_year = _month_end(when.year - 1, when.month)
        prev_month = _month_end(when.year - (when.month == 1), (when.month - 2) % 12 + 1)
        full_fy = date(start, 6, 30)
        if when.month == 7:
            # July is both the latest month and the whole year to date.
            columns = [(1, "", full_fy), (2, ".ytd", when), (5, ".ytd", prev_year),
                       (2, ".monthly", when), (3, ".monthly", prev_month), (5, ".monthly", prev_year)]
        elif when.month == 6:
            # In June the two YTD columns are full fiscal years. The standalone
            # previous-FY column disappears, shifting the monthly columns left.
            columns = [(1, "", when), (2, "", prev_year), (1, ".ytd", when), (2, ".ytd", prev_year),
                       (4, ".monthly", when), (5, ".monthly", prev_month), (7, ".monthly", prev_year)]
        else:
            columns = [(1, "", full_fy), (2, ".ytd", when), (3, ".ytd", prev_year),
                       (5, ".monthly", when), (6, ".monthly", prev_month), (8, ".monthly", prev_year)]
        out: list[Record] = []
        catalog: dict[str, dict] = {}
        category = ""
        for row in sheet.iter_rows(min_row=7, max_col=max(c for c, _, _ in columns) + 1, values_only=True):
            label = clean_label(row[0])
            if (not label or label.startswith("*") or label.lower().startswith("all products")
                    or label.lower() == "products" or label.isdigit()):
                continue
            display = re.sub(r"^(?:(?:[A-Z]\.|\(\d+\)|[a-z]\)|[IVX]+\.)\s*){1,3}", "", label).strip()
            if not display:
                continue
            slug = slugify(label)
            description = label
            if re.match(r"^(?:[A-Z]\.|\(\d+\))\s*", label):
                category = display
            if display.lower() in {"other", "others"} and category:
                # EPB repeats labels such as "e) Others" under unrelated categories.
                slug = f"{slugify(category)}.other"
                display = f"{category} — other"
                description = f"{category} — {label}"
            for col, suffix, obs_date in columns:
                value = _num(row[col])
                if value is None:
                    continue
                sid = f"trade.exports.{slug}{suffix}"
                if sid not in catalog:
                    qualifier = {".ytd": "FY-to-date", ".monthly": "monthly", "": "full fiscal year"}[suffix]
                    catalog[sid] = _series(sid, f"Exports — {display} ({qualifier})",
                                           f"EPB goods exports: {description} ({qualifier}), USD million.", {})
                out.append(Record(sid, obs_date, value))
        if not out:
            raise ValueError("EPB product summary contained no observations")
        ensure_series(list(catalog.values()))
        return out

    @staticmethod
    def _parse_destinations(wb, expected: date) -> list[Record]:
        sheets = {name.lower().strip(): wb[name] for name in wb.sheetnames}
        summary = sheets["country summary"]
        levels = [(2, "chapter", sheets["2 digit"])]
        if "4 digit" in sheets:
            levels.append((4, "heading", sheets["4 digit"]))
        for sheet in (summary, *(sheet for _, _, sheet in levels)):
            _, when = _workbook_period(sheet)
            if when != expected:
                raise ValueError(f"EPB {sheet.title} covers {when}, expected {expected}")
        if summary["B6"].value != "USD" or any(sheet["C5"].value != "USD" for _, _, sheet in levels):
            raise ValueError("Expected EPB destination tables in USD")
        total_id = "trade.exports.country.ytd"
        dims = {"country": "EPB destination code"}
        catalog = {total_id: _series(total_id, "Goods exports by destination (FY-to-date)",
                                    "EPB goods exports by destination, USD million.", dims)}
        out: list[Record] = []
        for label, raw in summary.iter_rows(min_row=7, max_col=2, values_only=True):
            country = _COUNTRY.match(str(label or "").lstrip())
            value = _num(raw)
            if country and value is not None:
                out.append(Record(total_id, expected, value / 1_000_000, {"country": country[1]}))
        if not out:
            raise ValueError("EPB destination table contained no observations")
        for digits, level, sheet in levels:
            country = None
            start = len(out)
            for label, product, raw in sheet.iter_rows(min_row=6, max_col=3, values_only=True):
                if label:
                    country = _COUNTRY.match(str(label).lstrip())
                product = _PRODUCT.match(clean_label(product))
                value = _num(raw)
                if not country or not product or len(product[1]) != digits or value is None:
                    continue
                code, name = product.groups()
                sid = f"trade.exports.hs{digits}.{code}.ytd"
                if sid not in catalog:
                    catalog[sid] = _series(
                        sid, f"Exports HS {code} — {name} (FY-to-date)",
                        f"EPB goods exports by HS {level} and destination, USD million.", dims,
                    )
                out.append(Record(sid, expected, value / 1_000_000, {"country": country[1]}))
            if len(out) == start:
                raise ValueError(f"EPB HS{digits} table contained no observations")
        ensure_series(list(catalog.values()))
        return out


def _series(sid: str, name: str, description: str, dims: dict) -> dict:
    return {
        "id": sid, "module": "external", "name": name, "description": description,
        "unit": "usd_mn", "frequency": "monthly", "source": "EPB", "source_url": LANDING,
        "dimensions": dims, "min_value": 0, "max_value": 100_000,
        "max_step": 20_000 if not dims else None, "tier": "basic",
    }
