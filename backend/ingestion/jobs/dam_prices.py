"""DAM daily division-level retail prices.

DAM publishes one PDF per division per trading day. The division reports have a
9-column table (commodity, unit, current range, month-ago range, year-ago range)
and are text-extractable; the multi-division "summary" PDF is not, so it is
skipped. Dates come from the landing-page row.

Rows are stored in `dam_prices` and exposed at `/v1/agri/dam`.
"""
from __future__ import annotations

import io
import re
from datetime import date

import pdfplumber
from bs4 import BeautifulSoup

from ingestion import http_client
from ingestion.bb_tables import clean_label
from ingestion.catalog import ensure_series
from ingestion.framework import FetchedFile, IngestionJob, Record

LANDING = "https://dam.gov.bd/pages/marketprice"
_BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")

DIVISIONS = [
    ("ঢাকা", "Dhaka"),
    ("চট্টগ্র", "Chattogram"),
    ("খুলনা", "Khulna"),
    ("রাজশাহ", "Rajshahi"),
    ("র্নরশোি", "Rajshahi"),
    ("বরিশাল", "Barishal"),
    ("বিরশাল", "Barishal"),
    ("রংপুর", "Rangpur"),
    ("িাংপুি", "Rangpur"),
    ("সিলেট", "Sylhet"),
    ("নসরিট", "Sylhet"),
    ("ময়মনসিংহ", "Mymensingh"),
    ("ময়মিন", "Mymensingh"),
]


def _date(raw: str) -> date | None:
    s = str(raw).translate(_BN_DIGITS)
    m = re.search(r"(\d{1,2})-(\d{1,2})-(\d{4})", s)
    if not m:
        return None
    try:
        return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    except ValueError:
        return None


def _range(raw: object) -> tuple[float | None, float | None]:
    if raw is None:
        return None, None
    nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", str(raw).translate(_BN_DIGITS).replace(",", ""))]
    if not nums:
        return None, None
    if len(nums) == 1:
        return nums[0], nums[0]
    return min(nums[0], nums[1]), max(nums[0], nums[1])


def _division(text: str) -> str | None:
    for needle, name in DIVISIONS:
        if needle in text:
            return name
    return None


class DamPricesJob(IngestionJob):
    name = "dam_prices"
    source = "DAM"

    def fetch(self, backfill: bool = False) -> list[FetchedFile]:
        try:
            html = http_client.get(LANDING, timeout=60).text
        except Exception:
            return []
        soup = BeautifulSoup(html, "lxml")
        out: list[FetchedFile] = []
        seen: set[str] = set()
        dates = 0
        for tr in soup.find_all("tr"):
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
            if len(cells) < 2:
                continue
            when = _date(cells[1])
            if when is None:
                continue
            dates += 1
            for a in tr.find_all("a", href=True):
                href = a["href"]
                if not href.lower().endswith(".pdf") or href in seen:
                    continue
                seen.add(href)
                try:
                    content = http_client.get(href, timeout=120).content
                    if content[:4] == b"%PDF":
                        out.append(FetchedFile(f"dam_{when.isoformat()}_{len(out):02d}.pdf", content, when))
                except Exception:
                    continue
            if dates >= (10 if backfill else 3):
                break
        return out

    def parse(self, f: FetchedFile) -> list:
        rows: list[tuple] = []
        unit_hints = ("প্রতি", "প্রনি", "কেজি", "লিটার", "হালি", "কুইন্টাল", "মণ", "গ্রাম", "প্যাকেট", "টি")
        with pdfplumber.open(io.BytesIO(f.content)) as pdf:
            first = pdf.pages[0].extract_text() or ""
            division = _division(first)
            if division is None:
                return []
            for page in pdf.pages:
                for table in page.extract_tables():
                    for raw in table:
                        if not raw or len(raw) < 6:
                            continue
                        cells = [clean_label(c) for c in raw]
                        unit_idx = None
                        for i, cell in enumerate(cells):
                            if any(h in cell for h in unit_hints):
                                unit_idx = i
                                break
                        if unit_idx is None:
                            continue
                        commodity = cells[unit_idx - 1] if unit_idx > 0 else ""
                        if not commodity or commodity.isdigit():
                            commodity = cells[unit_idx - 2] if unit_idx > 1 else ""
                        if not commodity or commodity.translate(_BN_DIGITS).replace(".", "").replace("-", "").isdigit():
                            continue
                        ranges: list[tuple[float, float]] = []
                        for cell in cells[unit_idx + 1:]:
                            nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", cell.translate(_BN_DIGITS).replace(",", ""))]
                            if len(nums) >= 2:
                                ranges.append((min(nums[0], nums[1]), max(nums[0], nums[1])))
                        if not ranges:
                            continue
                        cmin, cmax = ranges[0]
                        mmin, mmax = ranges[1] if len(ranges) > 1 else (None, None)
                        ymin, ymax = ranges[2] if len(ranges) > 2 else (None, None)
                        rows.append((f.when, division, commodity, cells[unit_idx], cmin, cmax, mmin, mmax, ymin, ymax))
        if not rows:
            return []
        ensure_series([{
            "id": "dam.prices.rows", "module": "agri",
            "name": "DAM daily price rows",
            "description": "Number of commodity rows in DAM's daily division price reports.",
            "unit": "count", "frequency": "daily", "source": "DAM",
            "source_url": LANDING, "dimensions": {}, "min_value": 0,
            "max_value": 100_000, "max_step": None, "tier": "basic",
        }])
        from app import db

        with db.connection() as conn:
            with conn.cursor() as cur:
                cur.executemany(
                    """
                    INSERT INTO dam_prices
                        (price_date, division, commodity, unit, current_min, current_max,
                         month_ago_min, month_ago_max, year_ago_min, year_ago_max)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (price_date, division, commodity, unit)
                    DO UPDATE SET
                        current_min=EXCLUDED.current_min, current_max=EXCLUDED.current_max,
                        month_ago_min=EXCLUDED.month_ago_min, month_ago_max=EXCLUDED.month_ago_max,
                        year_ago_min=EXCLUDED.year_ago_min, year_ago_max=EXCLUDED.year_ago_max,
                        revised_at=now()
                    """,
                    rows,
                )
        return [Record("dam.prices.rows", f.when, len(rows))]
