"""NBR monthly revenue — the Revenue Collection statement PDF.

NBR publishes one PDF per month with two blocks: the month's collection and the
fiscal-year-to-date collection. The template is a 19-column table (customs,
VAT, income tax and their components), stable across releases. Values are crore
taka.

The PDF uses a legacy Bengali font that extracts as mojibake, so the job keys off
the table's row positions and column order, not the label text. The month/year is
read from the publication link ("জুন’২৬"), not the PDF.
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

LANDING = "https://nbr.gov.bd/publications/research-statistics/eng"
_BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
_MONTHS = {
    "জানুয়ারি": 1, "জানুয়ারি": 1, "ফেব্রুয়ারি": 2, "ফেব্রুয়ারি": 2, "মার্চ": 3,
    "এপ্রিল": 4, "মে": 5, "জুন": 6, "জুলাই": 7, "আগস্ট": 8, "সেপ্টেম্বর": 9,
    "অক্টোবর": 10, "নভেম্বর": 11, "ডিসেম্বর": 12,
}

# 1-based data columns in the extracted table (the first cell is the row label).
COMPONENTS: list[tuple[int, str, str]] = [
    (1, "fiscal.nbr.customs_import_duty", "Customs import duty"),
    (2, "fiscal.nbr.vat_import", "VAT — import stage"),
    (3, "fiscal.nbr.supplementary_import", "Supplementary duty — import stage"),
    (4, "fiscal.nbr.regulatory_duty", "Regulatory duty"),
    (5, "fiscal.nbr.export_duty", "Export duty"),
    (6, "fiscal.nbr.other_customs", "Other customs receipts"),
    (7, "fiscal.nbr.customs", "Customs duty (subtotal)"),
    (8, "fiscal.nbr.excise", "Excise duty"),
    (9, "fiscal.nbr.vat_local", "VAT — local stage"),
    (10, "fiscal.nbr.supplementary_local", "Supplementary duty — local stage"),
    (11, "fiscal.nbr.turnover_tax", "Turnover tax"),
    (12, "fiscal.nbr.other_local", "Other local VAT receipts"),
    (13, "fiscal.nbr.vat", "VAT (subtotal)"),
    (14, "fiscal.nbr.income_tax", "Income tax"),
    (15, "fiscal.nbr.travel_tax", "Travel tax"),
    (16, "fiscal.nbr.other_taxes", "Other taxes"),
    (17, "fiscal.nbr.tax_subtotal", "Tax revenue (subtotal)"),
    (18, "fiscal.nbr.total", "Total tax revenue"),
]


def bn_num(raw: object) -> float | None:
    if raw is None:
        return None
    s = str(raw).translate(_BN_DIGITS).replace(",", "").replace("%", "").strip()
    if not s or s in {"-", "--", "—"}:
        return None
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    return float(m.group()) if m else None


def period_for(text: str) -> date | None:
    """Last Bengali month/year in a publication title -> month-end date."""
    text = text.translate(_BN_DIGITS)
    found = re.findall(r"(জানুয়ারি|জানুয়ারি|ফেব্রুয়ারি|ফেব্রুয়ারি|মার্চ|এপ্রিল|মে|জুন|জুলাই|আগস্ট|সেপ্টেম্বর|অক্টোবর|নভেম্বর|ডিসেম্বর)[’'\-–\s]*(\d{2,4})", text)
    if not found:
        return None
    month_name, year_s = found[-1]
    month = _MONTHS.get(month_name)
    if not month:
        return None
    year = int(year_s)
    if year < 100:
        year += 2000
    nxt = date(year + (month == 12), month % 12 + 1, 1)
    return date.fromordinal(nxt.toordinal() - 1)


def _valid_columns(row: list) -> bool:
    """The template's subtotals must add up; older layouts have different columns."""
    vals = [bn_num(row[c]) if c < len(row) else None for c in range(1, 19)]
    if any(v is None for v in vals):
        return False
    return (
        abs(sum(vals[0:6]) - vals[6]) < 1
        and abs(sum(vals[7:12]) - vals[12]) < 1
        and abs(sum(vals[13:16]) - vals[16]) < 1
        and abs(vals[6] + vals[12] + vals[16] - vals[17]) < 1
    )


class NbrRevenueJob(IngestionJob):
    name = "nbr_revenue"
    source = "NBR"

    def fetch(self, backfill: bool = False) -> list[FetchedFile]:
        try:
            html = http_client.get(LANDING, timeout=60).text
        except Exception:
            return []
        soup = BeautifulSoup(html, "lxml")
        out = []
        for i, a in enumerate(soup.find_all("a", href=True)):
            href = a["href"]
            text = clean_label(a.get_text(" ", strip=True))
            if not href.lower().endswith(".pdf"):
                continue
            if "রাজস্ব" not in text and "Revenue" not in text:
                continue
            when = period_for(text)
            if when is None:
                continue
            try:
                content = http_client.get(href, timeout=90).content
                if content[:4] == b"%PDF":
                    out.append(FetchedFile(f"nbr_revenue_{i:03d}.pdf", content, when))
            except Exception:
                continue
            if len(out) >= (24 if backfill else 6):
                break
        return out

    def parse(self, f: FetchedFile) -> list[Record]:
        with pdfplumber.open(io.BytesIO(f.content)) as pdf:
            table = None
            for page in pdf.pages:
                tables = page.extract_tables()
                if tables and len(tables[0]) >= 9:
                    table = tables[0]
                    break
        if not table:
            return []
        if len(table) < 9 or not _valid_columns(table[4]):
            return []
        # 0 header, 1 header, 2 column numbers, 3 monthly target, 4 monthly actual,
        # 5 monthly prior year, 6 monthly growth, 7 cumulative target,
        # 8 cumulative actual, 9 cumulative prior year, 10 cumulative growth.
        rows = {4: "", 8: ".fy_to_date"}
        dynamic: list[dict] = []
        for _, sid, name in COMPONENTS:
            for suffix, label in (("", "monthly"), (".fy_to_date", "fiscal-year-to-date")):
                dynamic.append({
                    "id": f"{sid}{suffix}", "module": "fiscal",
                    "name": f"{name} — {label}",
                    "description": f"NBR revenue collection, {name.lower()}, {label}, crore taka.",
                    "unit": "bdt_crore", "frequency": "monthly", "source": "NBR",
                    "source_url": LANDING, "dimensions": {}, "min_value": 0,
                    "max_value": 2_000_000, "max_step": None, "tier": "basic",
                })
        ensure_series(dynamic)
        out: list[Record] = []
        for row_index, suffix in rows.items():
            if row_index >= len(table):
                continue
            row = table[row_index]
            for col, sid, _ in COMPONENTS:
                if col >= len(row):
                    continue
                v = bn_num(row[col])
                if v is not None:
                    out.append(Record(f"{sid}{suffix}", f.when, v))
        return out
