"""TCB daily Dhaka retail prices — the Trading Corporation of Bangladesh's
"daily retail price of essential commodities" XLSX.

The landing page lists one workbook per trading day (attached from Oracle object
storage). Each workbook has a single "Daily retail price" sheet with min/max
prices for today, a week ago, a month ago and a year ago. We publish today's
min and max per item as `prices.tcb.<item>.{min,max}` in BDT per the item's
published unit.

The sheet is in Bengali, including Bengali numerals; item names are mapped to
stable English ids. Items without a mapping are kept out of the catalog rather
than given a meaningless id.
"""
from __future__ import annotations

import io
import re
from datetime import date, timedelta

import openpyxl
from bs4 import BeautifulSoup

from ingestion import http_client
from ingestion.bb_tables import clean_label
from ingestion.catalog import ensure_series
from ingestion.framework import FetchedFile, IngestionJob, Record

LANDING = "https://tcb.gov.bd/pages/daily-rmps"
_BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")

# longest prefixes first: (Bengali prefix, slug, English name)
ITEMS: list[tuple[str, str, str]] = [
    ("চাল সুগন্ধী", "rice_aromatic", "Aromatic rice (polao)"),
    ("চাল সরু", "rice_fine", "Fine rice (nazir/miniket)"),
    ("চাল (মাঝারী)", "rice_medium", "Medium rice (pajam/atash)"),
    ("চাল (মোটা)", "rice_coarse", "Coarse rice (swarna/china iri)"),
    ("আটা সাদা", "atta_open", "Atta, white (open)"),
    ("আটা (প্যাকেট)", "atta_packet", "Atta (packet)"),
    ("ময়দা (খোলা)", "maida_open", "Maida (open)"),
    ("ময়দা (প্যাকেট)", "maida_packet", "Maida (packet)"),
    ("সয়াবিন তেল (লুজ)", "soybean_oil_loose", "Soybean oil (loose)"),
    ("সয়াবিন তেল (বোতল)", "soybean_oil_bottle", "Soybean oil (bottled)"),
    ("পাম অয়েল", "palm_oil_loose", "Palm oil (loose)"),
    ("সুপার পাম অয়েল", "super_palm_oil", "Super palm oil (loose)"),
    ("রাইস ব্রান তেল", "rice_bran_oil", "Rice-bran oil (bottled)"),
    ("মশুর ডাল (বড়", "masoor_dal_large", "Masoor dal (large)"),
    ("মশুর ডাল (মাঝারী", "masoor_dal_medium", "Masoor dal (medium)"),
    ("মশুর ডাল (ছোট", "masoor_dal_small", "Masoor dal (small)"),
    ("মুগ ডাল", "mung_dal", "Mung dal"),
    ("এ্যাংকর ডাল", "anchor_dal", "Anchor dal"),
    ("ছোলা", "chickpea", "Chickpea"),
    ("আলু", "potato", "Potato"),
    ("পিঁয়াজ (দেশী)", "onion_local", "Onion (local)"),
    ("পিঁয়াজ (আমদানি)", "onion_imported", "Onion (imported)"),
    ("রসুন (দেশী)", "garlic_local", "Garlic (local)"),
    ("রসুন (আমদানি)", "garlic_imported", "Garlic (imported)"),
    ("শুকনা মরিচ (দেশী)", "dried_chilli_local", "Dried chilli (local)"),
    ("শুকনা মরিচ (আমদানি)", "dried_chilli_imported", "Dried chilli (imported)"),
    ("হলুদ (দেশী)", "turmeric_local", "Turmeric (local)"),
    ("হলুদ (আমদানি)", "turmeric_imported", "Turmeric (imported)"),
    ("আদা (দেশী)", "ginger_local", "Ginger (local)"),
    ("আদা (আমদানি)", "ginger_imported", "Ginger (imported)"),
    ("জিরা", "cumin", "Cumin"),
    ("দারুচিনি", "cinnamon", "Cinnamon"),
    ("লবঙ্গ", "clove", "Clove"),
    ("এলাচ", "cardamom", "Cardamom"),
    ("ধনে", "coriander", "Coriander"),
    ("তেজপাতা", "bay_leaf", "Bay leaf"),
    ("রুই", "rui_fish", "Rui fish"),
    ("ইলিশ", "hilsa", "Hilsa"),
    ("গরু", "beef", "Beef"),
    ("খাসী", "mutton", "Mutton"),
    ("মুরগী(ব্রয়লার)", "broiler_chicken", "Broiler chicken"),
    ("মুরগী (দেশী)", "desi_chicken", "Desi chicken"),
    ("ডানো", "milk_powder_dano", "Milk powder (Dano)"),
    ("ডিপ্লোমা", "milk_powder_diploma", "Milk powder (Diploma)"),
    ("ফ্রেশ", "milk_powder_fresh", "Milk powder (Fresh)"),
    ("মার্কস", "milk_powder_marks", "Milk powder (Marks)"),
    ("চিনি", "sugar", "Sugar"),
    ("খেজুর", "dates", "Dates"),
    ("লবণ", "salt", "Salt, iodised"),
    ("লেবু", "lemon", "Lemon"),
    ("কাঁচামরিচ", "green_chilli", "Green chilli"),
    ("বেগুন", "brinjal", "Brinjal"),
    ("শসা", "cucumber", "Cucumber"),
    ("ডিম", "egg_farm", "Eggs (farm)"),
    ("লেখার কাগজ", "writing_paper", "Writing paper (white)"),
    ("এম,এস রড (৬০", "ms_rod_60", "MS rod (60 grade)"),
    ("এম,এস রড( ৪০", "ms_rod_40", "MS rod (40 grade)"),
]


def _item(name: str, unit: str) -> tuple[str, str, str] | None:
    name = clean_label(name)
    unit_bn = clean_label(unit)
    for prefix, slug, english in ITEMS:
        if name.startswith(prefix):
            if slug == "soybean_oil_bottle":
                size = unit_bn.translate(_BN_DIGITS)
                m = re.search(r"\d+", size)
                litres = m.group() if m else "1"
                return f"{slug}_{int(litres)}l", f"{english} {int(litres)} L", "litre"
            if slug == "rice_aromatic" and "প্যাঃ" in unit_bn:
                return f"{slug}_packet", f"{english} (packet)", "kg"
            if slug == "rice_bran_oil":
                return slug, english, "litre"
            return slug, english, _unit(unit_bn)
    return None


def _unit(unit_bn: str) -> str:
    if "কেজি" in unit_bn or "কেজি" in unit_bn:
        return "kg"
    if "লিটার" in unit_bn:
        return "litre"
    if "হালি" in unit_bn:
        return "hali"
    if "দিস্তা" in unit_bn:
        return "dosta"
    if "মেঃটন" in unit_bn or "মেট্রিক" in unit_bn:
        return "tonne"
    if "গ্রাম" in unit_bn:
        return "gram"
    return "unit"


def _date(ws) -> date | None:
    for row in (5, 4, 3):
        s = clean_label(ws.cell(row, 1).value).translate(_BN_DIGITS)
        m = re.search(r"(\d{1,2})[-/](\d{1,2})[-/](\d{4})", s)
        if m:
            try:
                return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
            except ValueError:
                pass
    return None


class TcbPricesJob(IngestionJob):
    name = "tcb_prices"
    source = "TCB"

    def fetch(self, backfill: bool = False) -> list[FetchedFile]:
        try:
            html = http_client.get(LANDING, timeout=60).text
        except Exception:
            return []
        soup = BeautifulSoup(html, "lxml")
        links = [a["href"] for a in soup.find_all("a", href=True)
                 if a["href"].lower().endswith(".xlsx")]
        out = []
        for i, url in enumerate(list(dict.fromkeys(links))[:20]):
            try:
                content = http_client.get(url, timeout=120).content
                if content[:2] == b"PK":
                    out.append(FetchedFile(f"tcb_{i:02d}.xlsx", content, date.today()))
            except Exception:
                continue
        out.sort(key=lambda f: f.when)
        return out

    def parse(self, f: FetchedFile) -> list[Record]:
        wb = openpyxl.load_workbook(io.BytesIO(f.content), data_only=True)
        ws = wb["Daily retail price"] if "Daily retail price" in wb.sheetnames else wb.worksheets[0]
        d = _date(ws)
        if d is None:
            wb.close()
            return []
        records: dict[tuple[str, date], float] = {}
        dynamic: dict[str, dict] = {}
        for row in range(9, ws.max_row + 1):
            item = _item(ws.cell(row, 1).value, ws.cell(row, 2).value)
            if item is None:
                continue
            slug, english, unit = item
            # Current, a week ago, a month ago and a year ago are printed side by
            # side. Re-emitting the prior columns turns every reprint into a real
            # vintage: if a later workbook restates an old date, the trigger records
            # the revision.
            for offset, cmin, cmax in (
                (0, 3, 4),
                (7, 5, 6),
                (30, 7, 8),
                (365, 9, 10),
            ):
                obs_date = d - timedelta(days=offset)
                lo = ws.cell(row, cmin).value
                hi = ws.cell(row, cmax).value if ws.max_column >= cmax else lo
                if not isinstance(lo, (int, float)):
                    continue
                if not isinstance(hi, (int, float)):
                    hi = lo
                for suffix, value, label in (("min", lo, "minimum"), ("max", hi, "maximum")):
                    if value is None or value <= 0:
                        continue
                    sid = f"prices.tcb.{slug}.{suffix}"
                    dynamic[sid] = {
                        "id": sid, "module": "commodities",
                        "name": f"{english} — {label} retail price (BDT/{unit})",
                        "description": f"TCB daily Dhaka retail price, {english}, {label}, BDT per {unit}.",
                        "unit": "bdt", "frequency": "daily", "source": "TCB",
                        "source_url": LANDING, "dimensions": {"unit": unit},
                        "min_value": 0, "max_value": 500_000, "max_step": None, "tier": "basic",
                    }
                    records[(sid, obs_date)] = float(value)
        wb.close()
        if dynamic:
            ensure_series(list(dynamic.values()))
        return [Record(sid, obs_date, v, {"unit": dynamic[sid]["dimensions"]["unit"]})
                for (sid, obs_date), v in records.items()]
