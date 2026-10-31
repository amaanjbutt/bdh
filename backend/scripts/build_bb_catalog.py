"""Build the committed BB series catalog from the two Excel workbooks.

    python -m scripts.build_bb_catalog current.xlsx historical.xlsx

The ingestion job parses the same declarative specs, so every id it emits is
guaranteed to exist in the catalog. Run this whenever BB changes a table layout.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from ingestion import bb_tables

OUT = Path(__file__).resolve().parents[1] / "ingestion" / "bb_catalog.json"

_BOUNDS = {
    "percent": (-50, 100, 25),
    "index": (0, 10000, 1000),
    "bdt": (0, 10_000_000, 1_000_000),
    "bdt_crore": (0, 1_000_000_000, 100_000_000),
    "bdt_mn": (0, 1_000_000_000, 100_000_000),
    "usd": (0, 1_000_000, 100_000),
    "usd_mn": (-1_000_000, 1_000_000, 100_000),
    "thousand_tonnes": (0, 100_000_000, 10_000_000),
    "count": (0, 1_000_000_000, 100_000_000),
    "mixed": (None, None, None),
}


def main() -> None:
    current, historical = sys.argv[1], sys.argv[2]
    cat1, rec1 = bb_tables.parse_workbook(current, bb_tables.CURRENT_SPECS)
    cat2, rec2 = bb_tables.parse_workbook(historical, bb_tables.HISTORICAL_SPECS)
    rows = bb_tables.dedupe_catalog(cat1 + cat2)
    for r in rows:
        lo, hi, step = _BOUNDS.get(r.get("unit") or "mixed", (None, None, None))
        r["min_value"] = lo
        r["max_value"] = hi
        r["max_step"] = step
        r.setdefault("tier", "basic")
        r.setdefault("dimensions", {})
    rows.sort(key=lambda r: r["id"])
    OUT.write_text(json.dumps(rows, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(rows)} series to {OUT}")
    print(f"records available: current={len(rec1):,} historical={len(rec2):,}")


if __name__ == "__main__":
    main()
