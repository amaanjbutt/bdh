"""Declarative schedule for Bangladesh ingestion jobs (Asia/Dhaka).

The scheduler service reads this table, wires every registered job into
APScheduler, and runs an hourly staleness check using `expected_interval`.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta


@dataclass(frozen=True)
class Schedule:
    job: str
    cron: dict
    expected_interval: timedelta
    stale_on_run: bool = False


DAY = timedelta(days=1)

SCHEDULES: list[Schedule] = [
    # Daily market close (DSE trades Sunday-Thursday).
    Schedule("dse_market", {"hour": 16, "minute": 30, "day_of_week": "sun,mon,tue,wed,thu"},
             expected_interval=timedelta(days=4), stale_on_run=True),
    # Live macro pages: FX, reserves, remittances, rates, money, auctions.
    Schedule("bb_web", {"hour": 9, "minute": 20}, expected_interval=timedelta(days=3), stale_on_run=True),
    Schedule("bb_web", {"hour": 19, "minute": 20}, expected_interval=timedelta(days=3), stale_on_run=True),
    # Monthly BB workbook (current issue) + annual 1972-2024 history.
    Schedule("bb_workbook", {"hour": 6, "minute": 20}, expected_interval=timedelta(days=40), stale_on_run=True),
    # Digital finance / agent banking monthly workbook.
    Schedule("bb_payments", {"hour": 6, "minute": 45}, expected_interval=timedelta(days=40), stale_on_run=True),
    # BBS CPI release: check every morning; publish shortly after the monthly release.
    Schedule("bbs_cpi", {"hour": 7, "minute": 10}, expected_interval=timedelta(days=40), stale_on_run=True),
    # Annual/quarterly GDP: cheap monthly check.
    Schedule("bbs_gdp", {"hour": 7, "minute": 40}, expected_interval=timedelta(days=100), stale_on_run=True),
    # EPB monthly export summary (many product lines).
    Schedule("epb_exports", {"hour": 8, "minute": 10}, expected_interval=timedelta(days=40), stale_on_run=True),
    # Census 2022 district workbooks: one-off; monthly no-op check.
    Schedule("bbs_census", {"hour": 3, "minute": 20, "day_of_week": "sun"},
             expected_interval=timedelta(days=400), stale_on_run=True),
    # Derived layer after the morning macro jobs land.
    Schedule("derive_indicators", {"hour": 10, "minute": 0}, expected_interval=timedelta(days=3)),
]

MONITORED_EXTERNAL: list[Schedule] = []

WORKSTATION: frozenset[str] = frozenset()


def expected_intervals() -> dict[str, timedelta]:
    out: dict[str, timedelta] = {}
    for s in [*SCHEDULES, *MONITORED_EXTERNAL]:
        cur = out.get(s.job)
        if cur is None or s.expected_interval < cur:
            out[s.job] = s.expected_interval
    return out


def stale_on_run_jobs() -> set[str]:
    return {s.job for s in [*SCHEDULES, *MONITORED_EXTERNAL] if s.stale_on_run}
