"""BSEC mutual-fund registry (open-end and closed-end issues)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app import db

router = APIRouter(prefix="/v1/funds", tags=["funds"])


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
