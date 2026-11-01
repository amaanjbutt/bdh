"""ICB Asset Management Company daily NAV — open-ended funds.

ICB AMC publishes a daily NAV table (fund, face value, cost price/NAV and market
price). We publish the NAV and market price per fund. This is the first AMC
adapter; other managers can be added with the same table shape.
"""
from __future__ import annotations

import re
from datetime import date

from bs4 import BeautifulSoup

from ingestion import http_client
from ingestion.bb_tables import clean_label, slugify
from ingestion.catalog import ensure_series
from ingestion.framework import FetchedFile, IngestionJob, Record

URL = "https://icbamcl.gov.bd/investor-service/nav/nav-open-ended-mutual-funds"
_MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
)}


def _date(text: str) -> date | None:
    m = re.search(r"as on\s+(\d{1,2})\s*-\s*([A-Za-z]+)\s*-\s*(\d{4})", text, re.IGNORECASE)
    if not m:
        return None
    month = _MONTHS.get(m.group(2)[:3].lower())
    if not month:
        return None
    try:
        return date(int(m.group(3)), month, int(m.group(1)))
    except ValueError:
        return None


def _num(raw: str) -> float | None:
    s = str(raw).replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


class IcbNavJob(IngestionJob):
    name = "icb_nav"
    source = "ICB AMC"

    def fetch(self, backfill: bool = False) -> list[FetchedFile]:
        try:
            content = http_client.get(URL, timeout=60).content
        except Exception:
            return []
        return [FetchedFile("icb_nav.html", content, date.today())]

    def parse(self, f: FetchedFile) -> list[Record]:
        soup = BeautifulSoup(f.content, "lxml")
        text = soup.get_text(" ", strip=True)
        when = _date(text)
        if when is None:
            return []
        dynamic: list[dict] = []
        rows: list[Record] = []
        for table in soup.find_all("table")[:2]:
            for tr in table.find_all("tr"):
                cells = [clean_label(c.get_text(" ", strip=True)) for c in tr.find_all(["td", "th"])]
                if len(cells) < 4 or cells[0].lower() == "fund name":
                    continue
                name, cost, market = cells[0], _num(cells[2]), _num(cells[3])
                # `.nav` is the transaction/headline NAV (market or fair value);
                # `.nav_cost` is the accounting cost NAV. Same convention as every
                # other AMC adapter.
                nav = market if market is not None else cost
                if not name or nav is None:
                    continue
                slug = slugify(name)
                for suffix, value, label in (
                    ("nav", nav, "NAV"),
                    ("nav_cost", cost if cost is not None and cost != nav else None,
                     "NAV at cost"),
                ):
                    if value is None:
                        continue
                    sid = f"funds.icb.{slug}.{suffix}"
                    dynamic.append({
                        "id": sid, "module": "funds",
                        "name": f"{name} — {label}",
                        "description": f"ICB Asset Management Company daily {label}, BDT per unit.",
                        "unit": "bdt", "frequency": "daily", "source": "ICB AMC",
                        "source_url": URL, "dimensions": {"fund": name},
                        "min_value": 0, "max_value": 100_000, "max_step": None, "tier": "basic",
                    })
                    rows.append(Record(sid, when, value, {"fund": name}))
        if dynamic:
            ensure_series(dynamic)
        return rows
