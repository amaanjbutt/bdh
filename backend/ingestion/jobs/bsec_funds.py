"""BSEC mutual-fund registry — every open-end and closed-end fund issue.

BSEC's mutual-fund page lists the consent date, subscription window and issue
size for each fund. It is a registry, not a NAV feed; `icb_nav` provides daily
NAVs for ICB AMC's funds.
"""
from __future__ import annotations

from datetime import date, datetime

from bs4 import BeautifulSoup

from ingestion import http_client
from ingestion.bb_tables import clean_label
from ingestion.catalog import ensure_series
from ingestion.framework import FetchedFile, IngestionJob, Record

URL = "https://www.sec.gov.bd/mutual-fund"
_DOC_TYPES = ("closed_end", "open_end")


def _date(raw: str) -> date | None:
    s = str(raw).strip()
    if not s or s == "-":
        return None
    for fmt in ("%d-%b-%Y", "%d %b %Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def _num(raw: str) -> float | None:
    try:
        return float(str(raw).replace(",", "").strip())
    except ValueError:
        return None


class BsecFundsJob(IngestionJob):
    name = "bsec_funds"
    source = "BSEC"

    def fetch(self, backfill: bool = False) -> list[FetchedFile]:
        try:
            content = http_client.get(URL, timeout=60).content
        except Exception:
            return []
        return [FetchedFile("bsec_funds.html", content, date.today())]

    def parse(self, f: FetchedFile) -> list:
        soup = BeautifulSoup(f.content, "lxml")
        rows: list[tuple] = []
        for table_no, table in enumerate(soup.find_all("table")[:2]):
            fund_type = _DOC_TYPES[min(table_no, 1)]
            for tr in table.find_all("tr"):
                cells = [clean_label(c.get_text(" ", strip=True)) for c in tr.find_all(["td", "th"])]
                if len(cells) < 6 or cells[0].lower() in {"sl", ""} or cells[1].lower().startswith("name of"):
                    continue
                name = cells[1]
                if not name:
                    continue
                href = ""
                for a in tr.find_all("a", href=True):
                    if a["href"].lower().endswith(".pdf"):
                        href = a["href"]
                        break
                if fund_type == "closed_end":
                    consent, op, close, nrb = (_date(cells[2]), _date(cells[3]), _date(cells[4]), _date(cells[5]))
                    amount = _num(cells[6]) if len(cells) > 6 else None
                else:
                    consent, op, close, nrb = (_date(cells[2]), _date(cells[3]), _date(cells[4]), None)
                    amount = _num(cells[5]) if len(cells) > 5 else None
                rows.append((name, fund_type, consent, op, close, nrb, amount, href))
        if not rows:
            return []
        from app import db

        with db.connection() as conn:
            with conn.cursor() as cur:
                cur.executemany(
                    """
                    INSERT INTO fund_registry
                        (name, fund_type, consent_date, subscription_open, subscription_close,
                         nrb_close, amount_crore, document_url)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (name) DO UPDATE SET
                        fund_type=EXCLUDED.fund_type, consent_date=EXCLUDED.consent_date,
                        subscription_open=EXCLUDED.subscription_open,
                        subscription_close=EXCLUDED.subscription_close,
                        nrb_close=EXCLUDED.nrb_close, amount_crore=EXCLUDED.amount_crore,
                        document_url=EXCLUDED.document_url, updated_at=now()
                    """,
                    rows,
                )
        ensure_series([{
            "id": "funds.registry.funds", "module": "funds",
            "name": "Mutual funds in the BSEC registry",
            "description": "Number of open-end and closed-end funds in BSEC's mutual-fund registry.",
            "unit": "count", "frequency": "irregular", "source": "BSEC",
            "source_url": URL, "dimensions": {}, "min_value": 0,
            "max_value": 10_000, "max_step": None, "tier": "basic",
        }])
        return [Record("funds.registry.funds", date.today(), len(rows))]
