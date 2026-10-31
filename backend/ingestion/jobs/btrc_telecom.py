"""BTRC telecom statistics — monthly subscriber, penetration and tower tables.

BTRC publishes these as server-rendered HTML tables (Bengali labels and Bengali
numerals). The tables are stable, so this job maps each column to a known series
instead of guessing from the header text. Dates are month-end.

Pages:
  mobile subscribers by operator
  internet subscribers (mobile, ISP/PSTN, total)
  teledensity and mobile-broadband penetration
  operator tower counts
"""
from __future__ import annotations

import re
from datetime import date

from bs4 import BeautifulSoup

from ingestion import http_client
from ingestion.bb_tables import clean_label
from ingestion.catalog import ensure_series
from ingestion.framework import FetchedFile, IngestionJob, Record

BASE = "https://btrc.gov.bd/pages/static-pages"
PAGES = {
    "btrc_mobile.html": f"{BASE}/6922dda8933eb65569e15c3d",
    "btrc_internet.html": "https://btrc.gov.bd/site/page/347df7fe-409f-451e-a415-65b109a207f5/",
    "btrc_teledensity.html": f"{BASE}/teledensity-penetration-8ecc0e-6922e009933eb65569e2524c",
    "btrc_towers.html": f"{BASE}/number-of-operator-s-towers-3a9686-6922dbce933eb65569e0cab2",
}

_BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
_MONTHS = {
    "জানুয়ারি": 1, "জানুয়ারি": 1, "ফেব্রুয়ারি": 2, "ফেব্রুয়ারি": 2, "ফেব্রুয়ারী": 2,
    "ফেব্রুয়ারী": 2, "মার্চ": 3,
    "এপ্রিল": 4, "মে": 5, "জুন": 6, "জুলাই": 7, "আগস্ট": 8, "সেপ্টেম্বর": 9,
    "অক্টোবর": 10, "নভেম্বর": 11, "ডিসেম্বর": 12,
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8,
    "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}

# filename -> (column, series suffix, readable name, unit)
SPECS: dict[str, list[tuple[int, str, str, str]]] = {
    "btrc_mobile.html": [
        (1, "telecom.mobile.gp", "Mobile subscribers — Grameenphone", "million"),
        (2, "telecom.mobile.robi", "Mobile subscribers — Robi Axiata", "million"),
        (3, "telecom.mobile.banglalink", "Mobile subscribers — Banglalink", "million"),
        (4, "telecom.mobile.teletalk", "Mobile subscribers — Teletalk", "million"),
        (5, "telecom.mobile.total", "Mobile subscribers — total", "million"),
    ],
    "btrc_internet.html": [
        (1, "telecom.internet.mobile", "Internet subscribers — mobile", "million"),
        (2, "telecom.internet.isp_pstn", "Internet subscribers — ISP and PSTN", "million"),
        (3, "telecom.internet.total", "Internet subscribers — total", "million"),
    ],
    "btrc_teledensity.html": [
        (1, "telecom.teledensity.total", "Teledensity (voice and internet)", "percent"),
        (2, "telecom.internet.penetration", "Internet penetration", "percent"),
        (3, "telecom.broadband.fixed.penetration", "Fixed-broadband penetration", "percent"),
        (4, "telecom.internet.mobile.penetration", "Mobile-internet penetration", "percent"),
        (5, "telecom.broadband.mobile.subscribers", "Mobile-broadband subscribers", "million"),
        (6, "telecom.broadband.mobile.penetration", "Mobile-broadband penetration", "percent"),
        (7, "telecom.mobile.3g.subscribers", "3G subscribers", "million"),
        (8, "telecom.mobile.4g.subscribers", "4G subscribers", "million"),
    ],
    "btrc_towers.html": [
        (1, "telecom.towers.gp", "Towers — Grameenphone", "count"),
        (2, "telecom.towers.robi", "Towers — Robi", "count"),
        (3, "telecom.towers.banglalink", "Towers — Banglalink", "count"),
        (4, "telecom.towers.teletalk", "Towers — Teletalk", "count"),
        (5, "telecom.towers.edotco", "Towers — edotco", "count"),
        (6, "telecom.towers.summit", "Towers — Summit", "count"),
        (7, "telecom.towers.kirtonkhola", "Towers — Kirtonkhola", "count"),
        (8, "telecom.towers.frontier", "Towers — Frontier", "count"),
        (9, "telecom.towers.btcl", "Towers — BTCL", "count"),
        (10, "telecom.towers.total", "Towers — total", "count"),
    ],
}


def bn_num(raw: object) -> float | None:
    if raw is None:
        return None
    s = str(raw).translate(_BN_DIGITS)
    s = s.replace(",", "").replace("%", "").replace("মিলিয়ন", "").replace("মিলিয়ন", "").strip()
    if not s or s in {"-", "--", "—"}:
        return None
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    return float(m.group()) if m else None


def period(raw: object) -> date | None:
    s = clean_label(raw).translate(_BN_DIGITS)
    m = re.search(r"([A-Za-z\u0980-\u09FF]+)\s*,?\s*(\d{4})", s)
    if not m:
        return None
    month = _MONTHS.get(m.group(1).lower())
    if not month:
        return None
    year = int(m.group(2))
    nxt = date(year + (month == 12), month % 12 + 1, 1)
    return date.fromordinal(nxt.toordinal() - 1)


class BtrcTelecomJob(IngestionJob):
    name = "btrc_telecom"
    source = "BTRC"

    def fetch(self, backfill: bool = False) -> list[FetchedFile]:
        out = []
        for filename, url in PAGES.items():
            try:
                content = http_client.get(url, timeout=90).content
                if b"<table" in content.lower():
                    out.append(FetchedFile(filename, content, date.today()))
            except Exception:
                continue
        return out

    def parse(self, f: FetchedFile) -> list[Record]:
        spec = SPECS.get(f.filename)
        if not spec:
            return []
        soup = BeautifulSoup(f.content, "lxml")
        tables = soup.find_all("table")
        if not tables:
            return []
        # The first table is the current series; older pages add a second
        # (pre-2023) table with a narrower set of columns.
        rows = tables[0].find_all("tr")
        dynamic = [{
            "id": sid, "module": "telecom", "name": name,
            "description": f"BTRC monthly telecom statistics: {name}.",
            "unit": unit, "frequency": "monthly", "source": "BTRC",
            "source_url": PAGES[f.filename], "dimensions": {},
            "min_value": 0, "max_value": 500 if unit != "count" else 1_000_000,
            "max_step": None, "tier": "basic",
        } for _, sid, name, unit in spec]
        ensure_series(dynamic)
        out: list[Record] = []
        for tr in rows:
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
            if len(cells) <= max(c for c, *_ in spec):
                continue
            d = period(cells[0])
            if d is None:
                continue
            for col, sid, _, _ in spec:
                v = bn_num(cells[col])
                if v is not None:
                    out.append(Record(sid, d, v))
        return out
