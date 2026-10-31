"""Site-wide search: series plus everything in `search_entities`.

Series keep the catalog ranking (exact id, id prefix, name prefix, name, description); every
word of the query has to match somewhere. Entities (currently the Census 2022 districts) are
matched the same way against every name they go by, then by trigram similarity when nothing
matches word for word (typos). Results carry `kind`, `title`, `subtitle` and `url` (the site
page); series rows keep their catalog fields.
"""
from __future__ import annotations

import re
from typing import Any

from app import db

ENTITY_KINDS = ("district",)
KINDS = ("series",) + ENTITY_KINDS


def _words(q: str) -> list[str]:
    return [w for w in re.split(r"\s+", q.strip().lower()) if w][:6]


def search_series(q: str, module: str | None = None, limit: int = 20) -> list[dict]:
    words = _words(q)
    if not words:
        return []
    params: dict[str, Any] = {"q": q.strip(), "prefix": f"{q.strip()}%", "like": f"%{q.strip()}%", "limit": limit}
    clauses = ["is_active = true"]
    for i, w in enumerate(words):
        params[f"w{i}"] = f"%{w}%"
        clauses.append(f"(id ILIKE %(w{i})s OR name ILIKE %(w{i})s OR description ILIKE %(w{i})s)")
    if module:
        clauses.append("module = %(module)s")
        params["module"] = module
    rows = db.query(f"""
        SELECT id, module, name, unit, frequency, source, tier,
               CASE WHEN lower(id) = lower(%(q)s) THEN 0
                    WHEN id ILIKE %(prefix)s THEN 1
                    WHEN name ILIKE %(prefix)s THEN 2
                    WHEN name ILIKE %(like)s THEN 3
                    ELSE 4 END AS rank
        FROM series WHERE {' AND '.join(clauses)}
        ORDER BY rank, length(id), name LIMIT %(limit)s""", params)
    return rows


def search_entities(q: str, kinds: tuple[str, ...] = ENTITY_KINDS, limit: int = 20) -> list[dict]:
    words = _words(q)
    if not words or not kinds:
        return []
    params: dict[str, Any] = {"q": q.strip().lower(), "prefix": f"{q.strip().lower()}%", "kinds": list(kinds),
                              "limit": limit}
    conds = []
    for i, w in enumerate(words):
        params[f"w{i}"] = f"%{w}%"
        conds.append(f"haystack LIKE %(w{i})s")
    sql = f"""
        SELECT kind, key, title, subtitle, url, boost,
               CASE WHEN lower(title) = %(q)s OR lower(key) = %(q)s THEN 0
                    WHEN lower(title) LIKE %(prefix)s THEN 1
                    WHEN lower(title) LIKE '%%' || %(q)s || '%%' THEN 2
                    ELSE 3 END AS rank
        FROM search_entities
        WHERE kind = ANY(%(kinds)s) AND {' AND '.join(conds)}
        ORDER BY rank, boost DESC, length(title) LIMIT %(limit)s"""
    rows = db.query(sql, params)
    if rows or len(q.strip()) < 3:
        return rows
    # nothing word for word: closest names by trigram similarity (typos, "karote", "meezen")
    return db.query("""
        SELECT kind, key, title, subtitle, url, boost, 3 AS rank
        FROM search_entities
        WHERE kind = ANY(%(kinds)s) AND %(q)s <%% haystack
        ORDER BY word_similarity(%(q)s, haystack) DESC, boost DESC LIMIT %(limit)s""", params)


def _series_row(r: dict) -> dict:
    return {**{k: r[k] for k in ("id", "module", "name", "unit", "frequency", "source", "tier")},
            "kind": "series", "title": r["name"], "subtitle": r["id"], "url": f"/series/{r['id']}",
            "rank": r["rank"]}


def search_all(q: str, kinds: tuple[str, ...] = KINDS, module: str | None = None, limit: int = 20) -> list[dict]:
    """Series and entities interleaved by match quality (exact/prefix first), series first on ties."""
    rows: list[dict] = []
    if "series" in kinds:
        rows += [_series_row(r) for r in search_series(q, module=module, limit=limit)]
    ent_kinds = tuple(k for k in kinds if k in ENTITY_KINDS)
    if ent_kinds and not module:
        seen = {(r["kind"], r.get("key")) for r in rows}
        rows += [r for r in search_entities(q, ent_kinds, limit) if (r["kind"], r["key"]) not in seen]
    order = {k: i for i, k in enumerate(KINDS)}
    rows.sort(key=lambda r: (r["rank"], -float(r.get("boost") or 0) if r["kind"] != "series" else -3.5,
                             order.get(r["kind"], 99)))
    for r in rows:
        r.pop("boost", None)
    return rows[:limit]
