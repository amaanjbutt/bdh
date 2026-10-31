import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_bb_catalog_has_flagship_series():
    rows = json.loads((ROOT / "ingestion" / "bb_catalog.json").read_text(encoding="utf-8"))
    ids = {r["id"] for r in rows}
    for sid in ("fx.rate.usd", "fx.rate.usd.history", "inflation.cpi.national.2005base",
                "external.bop.capital_account_net", "monetary.m2", "fiscal.nbr.total"):
        assert sid in ids
    assert all(r.get("name") and r.get("frequency") for r in rows)


def test_core_catalog_ids_are_unique():
    from ingestion.catalog import CORE
    ids = [r["id"] for r in CORE]
    assert len(ids) == len(set(ids))
