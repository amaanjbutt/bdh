"""DAM daily division-level retail prices (dedicated table, not the series store)."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query

from app import db

router = APIRouter(prefix="/v1/agri", tags=["agri"])


@router.get("/dam")
def dam_prices(
    price_date: date | None = Query(None, description="Report date; omit for the latest"),
    division: str | None = Query(None, description="Dhaka, Chattogram, Rajshahi, …"),
    commodity: str | None = Query(None, description="Bengali commodity name, partial match"),
    limit: int = Query(500, ge=1, le=5000),
):
    """DAM daily retail prices by division. Public."""
    clauses, params = [], {"limit": limit}
    if price_date:
        clauses.append("price_date = %(d)s")
        params["d"] = price_date
    else:
        clauses.append("price_date = (SELECT max(price_date) FROM dam_prices)")
    if division:
        clauses.append("division ILIKE %(division)s")
        params["division"] = f"%{division}%"
    if commodity:
        clauses.append("commodity ILIKE %(commodity)s")
        params["commodity"] = f"%{commodity}%"
    rows = db.query(
        f"""SELECT price_date, division, commodity, unit, current_min, current_max,
                   month_ago_min, month_ago_max, year_ago_min, year_ago_max
            FROM dam_prices WHERE {' AND '.join(clauses)}
            ORDER BY division, commodity LIMIT %(limit)s""",
        params,
    )
    return {"success": True, "data": rows, "count": len(rows)}


@router.get("/dam/dates")
def dam_dates():
    """Dates and divisions available in the DAM table. Public."""
    rows = db.query(
        """SELECT price_date, count(*) AS rows, array_agg(DISTINCT division ORDER BY division) AS divisions
           FROM dam_prices GROUP BY price_date ORDER BY price_date DESC LIMIT 60"""
    )
    return {"success": True, "data": rows, "count": len(rows)}
