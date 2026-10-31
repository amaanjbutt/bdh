"""DSE market endpoints backed by the dedicated market tables.

    GET /v1/market/overview              latest indices + session totals
    GET /v1/market/securities            listed instruments + latest price
    GET /v1/market/securities/{code}/prices
    GET /v1/market/daily                 daily index/turnover history
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from app import db
from app.security import Caller, authenticate
from app.services import cache

router = APIRouter(prefix="/v1/market", tags=["market"])


def _f(v):
    return float(v) if v is not None else None


@router.get("/overview")
def overview():
    def build():
        indices = db.query(
            """SELECT DISTINCT ON (index_code) index_code, obs_date, value, change, change_pct
               FROM dse_indices ORDER BY index_code, obs_date DESC""")
        day = db.query_one(
            "SELECT * FROM dse_market_daily ORDER BY obs_date DESC LIMIT 1") or {}
        return {
            "success": True,
            "indices": [
                {"code": r["index_code"], "date": r["obs_date"].isoformat(),
                 "value": _f(r["value"]), "change": _f(r["change"]),
                 "change_pct": _f(r["change_pct"])} for r in indices
            ],
            "session": {
                "date": day["obs_date"].isoformat() if day.get("obs_date") else None,
                "turnover_mn": _f(day.get("turnover_mn")),
                "volume": _f(day.get("volume")),
                "trades": day.get("trades"),
                "advances": day.get("advances"),
                "declines": day.get("declines"),
                "unchanged": day.get("unchanged"),
                "market_cap_total_mn": _f(day.get("market_cap_total_mn")),
            },
        }
    return cache.cached_json("market:overview:v1", 120, build)


@router.get("/securities")
def securities(
    q: str | None = Query(None, description="Code or name filter"),
    sector: str | None = None,
    limit: int = Query(1000, ge=1, le=5000),
    caller: Caller = Depends(authenticate),
):
    def build():
        clauses = ["s.is_active"]
        params: dict = {"limit": limit}
        if q:
            clauses.append("(s.code ILIKE %(q)s OR s.name ILIKE %(q)s)")
            params["q"] = f"%{q}%"
        if sector:
            clauses.append("s.sector = %(sector)s")
            params["sector"] = sector
        rows = db.query(
            f"""SELECT s.code, s.name, s.sector, s.board, s.category, s.asset_type,
                       p.obs_date, p.ltp, p.ycp, p.close, p.volume, p.value_mn,
                       p.trades, p.change_pct
                FROM dse_securities s
                LEFT JOIN LATERAL (
                    SELECT * FROM dse_prices p WHERE p.code = s.code
                    ORDER BY obs_date DESC LIMIT 1) p ON true
                WHERE {' AND '.join(clauses)}
                ORDER BY COALESCE(p.value_mn, 0) DESC
                LIMIT %(limit)s""",
            params,
        )
        return {"success": True, "data": [
            {"code": r["code"], "name": r["name"], "sector": r["sector"],
             "board": r["board"], "category": r["category"], "asset_type": r["asset_type"],
             "date": r["obs_date"].isoformat() if r["obs_date"] else None,
             "ltp": _f(r["ltp"]), "ycp": _f(r["ycp"]), "close": _f(r["close"]),
             "volume": _f(r["volume"]), "value_mn": _f(r["value_mn"]),
             "trades": r["trades"], "change_pct": _f(r["change_pct"])}
            for r in rows
        ], "count": len(rows)}
    return cache.cached_json(f"market:securities:{q}:{sector}:{limit}", 120, build)


@router.get("/securities/{code}/prices")
def prices(
    code: str,
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    limit: int = Query(1000, ge=1, le=5000),
    caller: Caller = Depends(authenticate),
):
    if not db.query_one("SELECT 1 FROM dse_securities WHERE code=%s", (code,)):
        raise HTTPException(status_code=404, detail="unknown instrument")
    clauses = ["code=%s"]
    params: list = [code]
    if date_from:
        clauses.append("obs_date >= %s")
        params.append(date_from)
    if date_to:
        clauses.append("obs_date <= %s")
        params.append(date_to)
    params.append(limit)
    rows = db.query(
        f"SELECT * FROM dse_prices WHERE {' AND '.join(clauses)} ORDER BY obs_date DESC LIMIT %s",
        params,
    )
    return {"success": True, "code": code, "data": [
        {"date": r["obs_date"].isoformat(), "ltp": _f(r["ltp"]), "ycp": _f(r["ycp"]),
         "open": _f(r["open"]), "high": _f(r["high"]), "low": _f(r["low"]),
         "close": _f(r["close"]), "volume": _f(r["volume"]),
         "value_mn": _f(r["value_mn"]), "trades": r["trades"],
         "change_pct": _f(r["change_pct"])} for r in rows], "count": len(rows)}


@router.get("/daily")
def daily(limit: int = Query(500, ge=1, le=5000), caller: Caller = Depends(authenticate)):
    rows = db.query("SELECT * FROM dse_market_daily ORDER BY obs_date DESC LIMIT %s", (limit,))
    return {"success": True, "data": [
        {"date": r["obs_date"].isoformat(), "turnover_mn": _f(r["turnover_mn"]),
         "volume": _f(r["volume"]), "trades": r["trades"],
         "advances": r["advances"], "declines": r["declines"], "unchanged": r["unchanged"],
         "market_cap_total_mn": _f(r["market_cap_total_mn"])} for r in rows],
        "count": len(rows)}
