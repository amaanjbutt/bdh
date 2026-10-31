"""BPDB / NLDC daily power-system summary — generation, demand, fuel mix, imports
and load-shedding.

The daily archive publishes `page_1_*.pdf`, the National Load Dispatch Center's
System Summary Report. It is a text PDF with a stable first-page layout:
  - day/evening peak generation and demand
  - energy generated, demand and unserved
  - gas supplied and production cost per kWh
  - zone x fuel generation (MKWh)
  - zone load-shed and demand (MW)
  - cross-border import through the C/B interconnector

We read the 10 most recent page-1 PDFs. Values are the report's own units.
"""
from __future__ import annotations

import io
import re
from datetime import date

import pdfplumber
from bs4 import BeautifulSoup

from ingestion import http_client
from ingestion.catalog import ensure_series
from ingestion.framework import FetchedFile, IngestionJob, Record

ARCHIVE = "https://misc.bpdb.gov.bd/daily-generation-archive"

SUMMARY = [
    ("day_peak_generation", "Day peak generation", "MW", r"Day Peak Generation\s+([\d.]+) MW"),
    ("day_peak_demand", "Day peak demand", "MW", r"Day Peak Demand\s+([\d.]+) MW"),
    ("evening_peak_generation", "Evening peak generation", "MW", r"Evening Peak Generation\s+([\d.]+) MW"),
    ("evening_peak_demand", "Evening peak demand", "MW", r"Evening Peak Demand\s+([\d.]+) MW"),
    ("min_generation", "Minimum generation of the day", "MW", r"Minimum Generation of the Day\s+([\d.]+) MW"),
    ("max_generation", "Maximum generation of the day", "MW", r"Maximum Generation of the Day\s+([\d.]+) MW"),
    ("energy_generated", "Energy generated", "mkwh", r"Energy Generated\s+([\d.]+) MKWHr"),
    ("energy_demand", "Energy demand", "mkwh", r"Energy Demand\s+([\d.]+) MKWHr"),
    ("energy_unserved", "Energy unserved", "mkwh", r"Energy Unserverd\s+([\d.]+) MKWHr"),
    ("gas_supplied", "Gas supplied", "mmcfd", r"Total Gas Supplied\s+([\d.]+) MMCFD"),
    ("production_cost", "Production cost", "bdt_per_kwh", r"Production Cost per KWHr\s+([\d.]+) Tk"),
    ("import_total", "Cross-border import through C/B interconnector", "mkwh",
     r"Total Import through C/B Interconnector:\s*MKWHr:\s*([\d.]+)"),
]


def _num(raw: object) -> float | None:
    try:
        return float(str(raw).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def _date(text: str) -> date | None:
    m = re.search(r"Date\s*:\s*(\d{1,2})-(\d{1,2})-(\d{4})", text)
    if not m:
        return None
    try:
        return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    except ValueError:
        return None


class BpdbPowerJob(IngestionJob):
    name = "bpdb_power"
    source = "BPDB"

    def fetch(self, backfill: bool = False) -> list[FetchedFile]:
        try:
            html = http_client.get(ARCHIVE, timeout=60).text
        except Exception:
            return []
        soup = BeautifulSoup(html, "lxml")
        links = [a["href"] for a in soup.find_all("a", href=True)
                 if "/page_1_" in a["href"] and a["href"].lower().endswith(".pdf")]
        out = []
        for i, url in enumerate(list(dict.fromkeys(links))[:20 if backfill else 10]):
            try:
                content = http_client.get(url, timeout=120).content
                if content[:4] == b"%PDF":
                    out.append(FetchedFile(f"bpdb_{i:02d}.pdf", content, date.today()))
            except Exception:
                continue
        return out

    def parse(self, f: FetchedFile) -> list[Record]:
        with pdfplumber.open(io.BytesIO(f.content)) as pdf:
            page = pdf.pages[0]
            text = page.extract_text() or ""
            tables = page.extract_tables()
        d = _date(text)
        if d is None:
            return []
        dynamic: dict[str, dict] = {}
        out: list[Record] = []

        def add(sid: str, name: str, unit: str, value: float | None, module: str = "energy") -> None:
            if value is None:
                return
            dynamic[sid] = {
                "id": sid, "module": module, "name": name,
                "description": f"BPDB/NLDC daily system summary: {name}.",
                "unit": unit, "frequency": "daily", "source": "BPDB",
                "source_url": ARCHIVE, "dimensions": {}, "min_value": 0,
                "max_value": 1_000_000, "max_step": None, "tier": "basic",
            }
            out.append(Record(sid, d, value))

        for key, name, unit, pattern in SUMMARY:
            m = re.search(pattern, text, re.IGNORECASE)
            add(f"energy.power.{key}", name, unit, _num(m.group(1)) if m else None)

        # Zone x fuel generation table.
        for table in tables:
            header = " ".join(str(c or "") for c in table[0])
            if "Gas" in header and "Coal" in header and "Hydro" in header:
                heads = [str(c).strip() for c in table[0]]
                for row in table[1:]:
                    if not row or not row[0]:
                        continue
                    zone = str(row[0]).replace(" Zone", "").strip()
                    if zone.lower() == "total":
                        continue
                    for i, head in enumerate(heads[1:], start=1):
                        if head.lower() == "total" or i >= len(row):
                            continue
                        add(f"energy.power.generation.{zone.lower()}.{head.lower()}",
                            f"Generation — {zone}, {head}", "mkwh", _num(row[i]))
                break

        # Zone load-shed / demand table (evening peak).
        for table in tables:
            header = " ".join(str(c or "") for c in table[0]).lower()
            if "load" in header and "demand" in header and "zone" in header:
                for row in table[1:]:
                    if not row or not row[0]:
                        continue
                    zone = str(row[0]).replace(" Zone", "").strip().lower()
                    if zone == "total":
                        continue
                    add(f"energy.power.load_shed.{zone}", f"Load-shed — {zone}", "mw", _num(row[1]))
                    add(f"energy.power.demand.{zone}", f"Evening demand — {zone}", "mw", _num(row[2]))
                break

        if dynamic:
            ensure_series(list(dynamic.values()))
        return out
