"""Apply schema and seed the public catalog.

    python -m db.init

Local/CI only. Production applies new DDL deliberately and seeds only the
catalog rows that changed; never run this against prod without a backup.
"""
from __future__ import annotations

import json
import os
from datetime import date, timedelta

from app import db

HERE = os.path.dirname(__file__)


def _run_file(path: str) -> None:
    with open(path, "r", encoding="utf-8") as f:
        sql = f.read()
    with db.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
    print(f"applied {os.path.basename(path)}")


def _upsert(rows: list[dict]) -> int:
    n = 0
    with db.connection() as conn:
        with conn.cursor() as cur:
            for s in rows:
                cur.execute(
                    """
                    INSERT INTO series
                        (id, module, name, description, unit, frequency, source, source_url,
                         dimensions, min_value, max_value, max_step, tier)
                    VALUES (%(id)s,%(module)s,%(name)s,%(description)s,%(unit)s,%(frequency)s,
                            %(source)s,%(source_url)s,%(dimensions)s::jsonb,%(min_value)s,
                            %(max_value)s,%(max_step)s,%(tier)s)
                    ON CONFLICT (id) DO UPDATE SET
                        module=EXCLUDED.module, name=EXCLUDED.name,
                        description=EXCLUDED.description, unit=EXCLUDED.unit,
                        frequency=EXCLUDED.frequency, source=EXCLUDED.source,
                        source_url=EXCLUDED.source_url, dimensions=EXCLUDED.dimensions,
                        min_value=EXCLUDED.min_value, max_value=EXCLUDED.max_value,
                        max_step=EXCLUDED.max_step, tier=EXCLUDED.tier, is_active=true
                    """,
                    {**s, "dimensions": json.dumps(s.get("dimensions") or {})},
                )
                n += 1
    return n


def seed_bb_catalog() -> None:
    path = os.path.join(HERE, "..", "ingestion", "bb_catalog.json")
    with open(path, encoding="utf-8") as f:
        rows = json.load(f)
    print(f"seeded {_upsert(rows)} BB workbook series")


def seed_core_catalog() -> None:
    from ingestion.catalog import CORE

    print(f"seeded {_upsert(CORE)} core series")


def seed_calendar() -> None:
    """Forward-looking release calendar for the indicators users plan around."""
    today = date.today()
    horizon = today + timedelta(days=120)
    rules = [
        ("CPI inflation", "BBS", "inflation.cpi.national.yoy", "monthly_day", 1),
        ("Foreign exchange reserves", "BB", "reserves.gross", "monthly_day", 3),
        ("Workers' remittances", "BB", "remittances.total.usd", "monthly_day", 5),
        ("Monetary policy statement", "BB", "rates.policy", "monthly_day", 15),
        ("DSE monthly market report", "DSE", "market.dse.turnover", "monthly_day", 5),
        ("NBR revenue", "NBR", "fiscal.nbr.total", "monthly_day", 10),
    ]
    events = []
    for indicator, source, sid, kind, param in rules:
        y, m = today.year, today.month
        for _ in range(5):
            try:
                d = date(y, m, param)
            except ValueError:
                d = date(y, m, 28)
            if today <= d <= horizon:
                events.append((d, indicator, source, sid))
            m = 1 if m == 12 else m + 1
            y = y + 1 if m == 1 else y
    with db.connection() as conn:
        with conn.cursor() as cur:
            for d, ind, src, sid in events:
                cur.execute(
                    "INSERT INTO release_calendar (release_date, indicator, source, series_id) "
                    "VALUES (%s,%s,%s,%s) ON CONFLICT (release_date, indicator) DO NOTHING",
                    (d, ind, src, sid),
                )
    print(f"seeded {len(events)} calendar events")


def main() -> None:
    _run_file(os.path.join(HERE, "schema.sql"))
    seed_bb_catalog()
    seed_core_catalog()
    seed_calendar()
    print("database initialized")


if __name__ == "__main__":
    main()
