"""The search index for everything that is not a series: one row per findable thing.

`/v1/search?kinds=all` (and the site's ⌘K, /coverage and dashboard search) looks these up
next to the series catalog. Today the non-series entities are the 64 Census 2022 districts;
each row carries the page it opens (`url`) and a `haystack` of every name it goes by,
trigram-indexed.

`refresh()` rebuilds the table in one transaction; the scheduler runs it nightly.
"""
from __future__ import annotations

import logging
import math
import re

from app import db

log = logging.getLogger(__name__)

KINDS = ("district",)


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def _hay(*parts) -> str:
    return " ".join(str(p) for p in parts if p).lower()


def _rows_districts(cur) -> list[tuple]:
    from app.api.regional import _districts

    out = []
    for d in _districts():
        pop = d.get("population")
        sub = f"District, {d['province']}" + (f" · population {int(pop):,}" if pop else "")
        out.append(("district", f"{d['province']}|{d['district']}", d["district"], sub,
                    f"/districts/{_slug(d['district'])}", 4.0 + math.log10(1 + (pop or 0)) / 2,
                    _hay(d["district"], d["province"], "district population census household profile")))
    return out


BUILDERS = (_rows_districts,)


def refresh() -> dict:
    """Rebuild search_entities in one transaction. A builder that fails keeps its old rows."""
    counts: dict[str, int] = {}
    with db.connection() as conn:
        with conn.cursor() as cur:
            for build in BUILDERS:
                try:
                    with conn.transaction():
                        rows = build(cur)
                        kinds = sorted({r[0] for r in rows})
                        if not rows:
                            continue
                        cur.execute("DELETE FROM search_entities WHERE kind = ANY(%s)", (kinds,))
                        with cur.copy("COPY search_entities (kind, key, title, subtitle, url, boost, haystack) "
                                      "FROM STDIN") as cp:
                            for r in rows:
                                cp.write_row(r)
                        for k in kinds:
                            counts[k] = sum(1 for r in rows if r[0] == k)
                except Exception:  # noqa: BLE001 — one source must not empty the whole index
                    log.exception("search_entities: %s failed", build.__name__)
        conn.commit()
    log.info("search_entities.refresh: %s", counts)
    return counts
