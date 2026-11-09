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
from urllib.parse import urljoin, urlsplit

import pdfplumber
from bs4 import BeautifulSoup

from ingestion import http_client
from ingestion.bb_tables import clean_label
from ingestion.catalog import ensure_series
from ingestion.framework import FetchedFile, IngestionJob, Record

LANDING = "https://dam.gov.bd/pages/static-pages/6922e0d1933eb65569e28b21"
_BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")

DIVISIONS = [
    ("ঢাকা", "Dhaka"),
    ("চট্টগ্র", "Chattogram"),
    ("খুলনা", "Khulna"),
    ("রাজশাহ", "Rajshahi"),
    ("র্নরশোি", "Barishal"),
    ("বরিশাল", "Barishal"),
    ("বিরশাল", "Barishal"),
    ("রংপুর", "Rangpur"),
    ("িাংপুি", "Rangpur"),
    ("সিলেট", "Sylhet"),
    ("নসরিট", "Sylhet"),
    ("ময়মনসিংহ", "Mymensingh"),
    ("ময়মনসিংহ", "Mymensingh"),
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
    cleaned = str(raw).translate(_BN_DIGITS).replace(",", "").strip()
    match = re.fullmatch(r"(\d+(?:\.\d+)?)(?:(?:[ \t]*[-–−][ \t]*|[ \t]+)(\d+(?:\.\d+)?))?", cleaned)
    if not match:
        return None, None
    a = float(match[1])
    b = float(match[2]) if match[2] else a
    return min(a, b), max(a, b)


def _division(text: str) -> str | None:
    for needle, name in DIVISIONS:
        if needle in text:
            return name
    return None


class DamPricesJob(IngestionJob):
    name = "dam_prices"
    source = "DAM"

    def fetch(self, backfill: bool = False) -> list[FetchedFile]:
        html = http_client.get(LANDING, timeout=60, retry_transient=True).text
        soup = BeautifulSoup(html, "lxml")
        reports: dict[date, dict[str, str]] = {}
        divisions: dict[int, str] = {}
        for tr in soup.find_all("tr"):
            cells = tr.find_all(["td", "th"], recursive=False)
            labels = [c.get_text(" ", strip=True) for c in cells]
            headings = {i: division for i, label in enumerate(labels) if (division := _division(label))}
            if headings and any("তারিখ" in label for label in labels[:2]):
                divisions = headings
                continue
            when = next((parsed for label in labels[:2] if (parsed := _date(label))), None)
            if when is None or when > date.today():
                continue
            for index, division in divisions.items():
                link = cells[index].find("a", href=True) if index < len(cells) else None
                if link:
                    href = urljoin(LANDING, link["href"])
                    if urlsplit(href).path.lower().endswith(".pdf"):
                        reports.setdefault(when, {})[division] = href

        out: list[FetchedFile] = []
        recent = sorted(reports)[-(10 if backfill else 3):]
        for when in recent:
            for division, href in reports[when].items():
                try:
                    content = http_client.get(href, timeout=60, retry_transient=True).content
                    if content[:4] == b"%PDF":
                        out.append(FetchedFile(f"dam_{when}_{division.lower()}.pdf", content, when))
                        continue
                except Exception:
                    pass
                self.fetch_warnings.append(f"DAM {division} report for {when} could not be downloaded")
        if not recent or not any(f.when == recent[-1] for f in out):
            raise ValueError("DAM's latest division reports could not be downloaded")
        return out

    def parse(self, f: FetchedFile) -> list:
        by_product: dict[tuple, dict[str, tuple]] = {}
        unit_hints = ("প্রতি", "প্রনি", "কেজি", "কেনি", "কেতি", "লিটার", "হালি", "কুইন্টাল", "মণ", "গ্রাম", "টি")
        archive_division = f.filename.removesuffix(".pdf").rsplit("_", 1)[-1]
        with pdfplumber.open(io.BytesIO(f.content)) as pdf:
            division = next((d for _, d in DIVISIONS if d.lower() == archive_division), None)
            if division is None:
                division = _division(pdf.pages[0].extract_text() or "")
            if division is None:
                raise ValueError("DAM report division could not be identified")
            for page in pdf.pages:
                for table in page.extract_tables():
                    previous_unit = ""
                    category = ""
                    for raw in table:
                        if not raw or len(raw) < 6:
                            continue
                        cells = [clean_label(c) for c in raw]
                        unit_idx = None
                        for i, cell in enumerate(cells[2:4], 2):
                            if any(h in cell for h in unit_hints):
                                unit_idx = i
                                previous_unit = cell
                                break
                            if cell in {",,", '"'} and previous_unit:
                                unit_idx = i
                                break
                        if unit_idx is None:
                            continue
                        if unit_idx == 3 and cells[1] and cells[0].translate(_BN_DIGITS).isdigit():
                            category = cells[1]
                        commodity = cells[unit_idx - 1] if unit_idx > 0 else ""
                        if not commodity or commodity.isdigit():
                            commodity = cells[unit_idx - 2] if unit_idx > 1 else ""
                        if not commodity or commodity.translate(_BN_DIGITS).replace(".", "").replace("-", "").isdigit():
                            continue
                        prices = raw[unit_idx + 1:]
                        # Most reports alternate the older ranges with percentage
                        # changes. Some add a reference price or merged cells.
                        indices = {5: (0, 1, 3), 6: (1, 2, 4), 11: (0, 3, 7)}.get(len(prices))
                        if indices is None:
                            continue
                        (cmin, cmax), (mmin, mmax), (ymin, ymax) = (_range(prices[i]) for i in indices)
                        if cmin is not None:
                            key = (f.when, division, commodity, previous_unit)
                            by_product.setdefault(key, {})[category if unit_idx == 3 else ""] = (
                                cmin, cmax, mmin, mmax, ymin, ymax,
                            )
        rows = []
        for (when, division, commodity, unit), variants in by_product.items():
            for category, prices in variants.items():
                label = f"{category} — {commodity}" if len(variants) > 1 and category else commodity
                rows.append((when, division, label, unit, *prices))
        if not rows:
            raise ValueError(f"DAM {division} report has no extractable price rows for {f.when}")
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
                    WHERE (dam_prices.current_min, dam_prices.current_max,
                           dam_prices.month_ago_min, dam_prices.month_ago_max,
                           dam_prices.year_ago_min, dam_prices.year_ago_max)
                          IS DISTINCT FROM
                          (EXCLUDED.current_min, EXCLUDED.current_max,
                           EXCLUDED.month_ago_min, EXCLUDED.month_ago_max,
                           EXCLUDED.year_ago_min, EXCLUDED.year_ago_max)
                    """,
                    rows,
                )
                cur.execute("SELECT count(*) FROM dam_prices WHERE price_date = %s", (f.when,))
                count = cur.fetchone()[0]
        return [Record("dam.prices.rows", f.when, count)]
