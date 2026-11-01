"""Mutual funds: BSEC's registry plus per-AMC NAVs from the series store."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, Query

from app import db

router = APIRouter(prefix="/v1/funds", tags=["funds"])

_NAV_ONLY = """
    series_id LIKE 'funds.%%'
    AND series_id NOT LIKE 'funds.registry.%%'
    AND series_id NOT LIKE 'funds.amc_nav.%%'
"""


@router.get("/amcs")
def amcs():
    """Asset managers with published NAVs, their fund counts and coverage. Public."""
    rows = db.query(
        f"""
        SELECT split_part(s.id, '.', 2) AS amc,
               min(s.source) AS manager,
               count(DISTINCT s.id)::int AS series,
               count(DISTINCT o.dims->>'fund')::int AS funds,
               count(*)::int AS observations,
               min(o.obs_date) AS first_date,
               max(o.obs_date) AS last_date
        FROM series s
        JOIN observations o ON o.series_id = s.id
        WHERE {_NAV_ONLY.replace('series_id', 's.id')}
        GROUP BY 1 ORDER BY 1
        """
    )
    return {"success": True, "data": rows, "count": len(rows)}


@router.get("/nav")
def nav(
    amc: str | None = Query(None, description="Asset-manager slug, e.g. idlc or ucb"),
    fund: str | None = Query(None, description="Fund name, partial match"),
    as_of: date | None = Query(None, description="Latest NAV on or before this date"),
    limit: int = Query(500, ge=1, le=2000),
):
    """Latest NAV per fund, with cost NAV and market price where published. Public."""
    clauses, params = [], {"limit": limit}
    if amc:
        clauses.append("split_part(series_id, '.', 2) = %(amc)s")
        params["amc"] = amc
    if fund:
        clauses.append("dims->>'fund' ILIKE %(fund)s")
        params["fund"] = f"%{fund}%"
    if as_of:
        clauses.append("obs_date <= %(as_of)s")
        params["as_of"] = as_of
    where = f"AND {' AND '.join(clauses)}" if clauses else ""
    rows = db.query(
        f"""
        WITH latest AS (
            SELECT DISTINCT ON (o.series_id)
                   o.series_id, o.dims->>'fund' AS fund, o.obs_date, o.value
            FROM observations o
            WHERE {_NAV_ONLY} {where}
            ORDER BY o.series_id, o.obs_date DESC
        )
        SELECT split_part(l.series_id, '.', 2) AS amc,
               l.fund, l.obs_date AS date, l.value AS nav,
               c.value AS nav_cost, m.value AS market_price
        FROM latest l
        LEFT JOIN LATERAL (
            SELECT value FROM observations
            WHERE series_id = regexp_replace(l.series_id, '\\.nav$', '.nav_cost')
              AND obs_date = l.obs_date LIMIT 1
        ) c ON true
        LEFT JOIN LATERAL (
            SELECT value FROM observations
            WHERE series_id = regexp_replace(l.series_id, '\\.nav$', '.market_price')
              AND obs_date = l.obs_date LIMIT 1
        ) m ON true
        WHERE l.series_id LIKE '%%.nav'
        ORDER BY amc, l.fund LIMIT %(limit)s
        """,
        params,
    )
    return {"success": True, "data": rows, "count": len(rows)}


@router.get("/registry")
def registry(
    fund_type: str | None = Query(None, pattern="^(open_end|closed_end)$"),
    q: str | None = Query(None, description="Fund name search"),
    limit: int = Query(300, ge=1, le=1000),
):
    """Every fund in BSEC's registry. Public."""
    clauses, params = [], {"limit": limit}
    if fund_type:
        clauses.append("fund_type = %(type)s")
        params["type"] = fund_type
    if q:
        clauses.append("name ILIKE %(q)s")
        params["q"] = f"%{q}%"
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = db.query(
        f"""SELECT name, fund_type, consent_date, subscription_open, subscription_close,
                   nrb_close, amount_crore, document_url
            FROM fund_registry {where}
            ORDER BY consent_date DESC NULLS LAST, name LIMIT %(limit)s""",
        params,
    )
    return {"success": True, "data": rows, "count": len(rows)}


@router.get("/registry/{name}")
def fund(name: str):
    """One fund's registry record. Public."""
    row = db.query_one("SELECT * FROM fund_registry WHERE name = %(name)s", {"name": name})
    if not row:
        raise HTTPException(status_code=404, detail=f"unknown fund: {name}")
    return {"success": True, "data": row}
