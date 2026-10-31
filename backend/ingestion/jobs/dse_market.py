"""Dhaka Stock Exchange daily market data (new DSE JSON API).

Sources:
  /api/live/snapshot                 all instruments, OHLCV + indices + breadth
  /api/live/companies                instrument master + P/E + market cap
  /api/live/market-statistics        session totals, category breadth, market cap
  /api/live/data-archive/market-summary  daily index/turnover history (2 years)

The DSE API is public and unauthenticated. We poll it once per run, never intraday
in a loop, and cache the raw JSON in the object archive.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta

from ingestion import http_client
from ingestion.catalog import CORE, ensure_series
from ingestion.framework import FetchedFile, IngestionJob, Record

BASE = "https://www.dsebd.org"


def _d(s) -> date:
    if isinstance(s, date):
        return s
    return datetime.strptime(str(s)[:10], "%Y-%m-%d").date()


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


class DseMarketJob(IngestionJob):
    name = "dse_market"
    source = "DSE"

    def fetch(self, backfill: bool = False) -> list[FetchedFile]:
        today = date.today()
        start = today - timedelta(days=730 if backfill else 30)
        urls = {
            "dse_snapshot.json": f"{BASE}/api/live/snapshot",
            "dse_companies.json": f"{BASE}/api/live/companies",
            "dse_market_statistics.json": f"{BASE}/api/live/market-statistics",
            "dse_market_summary.json": (
                f"{BASE}/api/live/data-archive/market-summary"
                f"?from={start.isoformat()}&to={today.isoformat()}"
            ),
        }
        files = []
        for name, url in urls.items():
            try:
                content = http_client.get(url, timeout=60).content
            except Exception:
                continue
            files.append(FetchedFile(name, content, today))
        return files

    def parse(self, f: FetchedFile) -> list[Record]:
        if f.filename == "dse_snapshot.json":
            return self._snapshot(json.loads(f.content))
        if f.filename == "dse_companies.json":
            return self._companies(json.loads(f.content))
        if f.filename == "dse_market_statistics.json":
            return self._market_stats(json.loads(f.content))
        if f.filename == "dse_market_summary.json":
            return self._market_summary(json.loads(f.content))
        return []

    def _snapshot(self, data: dict) -> list[Record]:
        ensure_series([s for s in CORE if s["module"] == "market"])
        market = data.get("market") or {}
        session = market.get("session") or data.get("session") or {}
        trade_date = _d(session.get("sessionDate") or session.get("date") or date.today())
        prices = data.get("prices") or {}
        cols = prices.get("cols") or []
        idx = {c: i for i, c in enumerate(cols)}
        rows = prices.get("rows") or []
        out: list[Record] = []
        with self._db() as conn:
            with conn.cursor() as cur:
                for row in rows:
                    code = row[idx.get("code", 0)]
                    if not code:
                        continue
                    vals = {
                        "ltp": _f(row[idx["ltp"]]) if "ltp" in idx else None,
                        "ycp": _f(row[idx["ycp"]]) if "ycp" in idx else None,
                        "open": _f(row[idx["open"]]) if "open" in idx else None,
                        "high": _f(row[idx["high"]]) if "high" in idx else None,
                        "low": _f(row[idx["low"]]) if "low" in idx else None,
                        "close": _f(row[idx["close"]]) if "close" in idx else None,
                        "volume": _f(row[idx["volume"]]) if "volume" in idx else None,
                        "value_mn": _f(row[idx["value"]]) if "value" in idx else None,
                        "trades": int(row[idx["trades"]]) if "trades" in idx and row[idx["trades"]] is not None else None,
                        "change_pct": _f(row[idx["percent"]]) if "percent" in idx else None,
                    }
                    sector = row[idx["sector"]] if "sector" in idx else None
                    board = row[idx["board"]] if "board" in idx else None
                    category = row[idx["category"]] if "category" in idx else None
                    asset = row[idx["assetType"]] if "assetType" in idx else None
                    cur.execute(
                        """INSERT INTO dse_securities (code, sector, board, category, asset_type,
                                                       first_seen, last_seen, updated_at)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,now())
                           ON CONFLICT (code) DO UPDATE SET
                             sector=COALESCE(EXCLUDED.sector,dse_securities.sector),
                             board=COALESCE(EXCLUDED.board,dse_securities.board),
                             category=COALESCE(EXCLUDED.category,dse_securities.category),
                             asset_type=COALESCE(EXCLUDED.asset_type,dse_securities.asset_type),
                             first_seen=COALESCE(dse_securities.first_seen,EXCLUDED.first_seen),
                             last_seen=GREATEST(COALESCE(dse_securities.last_seen,EXCLUDED.last_seen),EXCLUDED.last_seen),
                             updated_at=now()""",
                        (code, sector, board, category, asset, trade_date, trade_date),
                    )
                    cur.execute(
                        """INSERT INTO dse_prices
                             (code, obs_date, ltp, ycp, open, high, low, close, volume,
                              value_mn, trades, change_pct, revised_at)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now())
                           ON CONFLICT (code, obs_date) DO UPDATE SET
                             ltp=EXCLUDED.ltp, ycp=EXCLUDED.ycp, open=EXCLUDED.open,
                             high=EXCLUDED.high, low=EXCLUDED.low, close=EXCLUDED.close,
                             volume=EXCLUDED.volume, value_mn=EXCLUDED.value_mn,
                             trades=EXCLUDED.trades, change_pct=EXCLUDED.change_pct,
                             revised_at=now()""",
                        (code, trade_date, vals["ltp"], vals["ycp"], vals["open"], vals["high"],
                         vals["low"], vals["close"], vals["volume"], vals["value_mn"],
                         vals["trades"], vals["change_pct"]),
                    )
                # Index levels and breadth from the snapshot.
                for ix in market.get("indices") or []:
                    key = str(ix.get("key") or "").upper()
                    if not key:
                        continue
                    val = _f(ix.get("value"))
                    chg = _f(ix.get("change"))
                    pct = _f(ix.get("percent"))
                    cur.execute(
                        """INSERT INTO dse_indices (index_code, obs_date, value, change, change_pct)
                           VALUES (%s,%s,%s,%s,%s)
                           ON CONFLICT (index_code, obs_date) DO UPDATE SET
                             value=EXCLUDED.value, change=EXCLUDED.change,
                             change_pct=EXCLUDED.change_pct, revised_at=now()""",
                        (key, trade_date, val, chg, pct),
                    )
                    sid = {"DSEX": "market.dse.index.dsex", "DS30": "market.dse.index.ds30",
                           "DSES": "market.dse.index.dses"}.get(key)
                    if sid and val is not None:
                        out.append(Record(sid, trade_date, val))
                totals = market.get("totals") or {}
                if totals.get("turnover") is not None:
                    out.append(Record("market.dse.turnover", trade_date, _f(totals["turnover"])))
                if totals.get("volume") is not None:
                    out.append(Record("market.dse.volume", trade_date, _f(totals["volume"])))
                if totals.get("trades") is not None:
                    out.append(Record("market.dse.trades", trade_date, _f(totals["trades"])))
        return out

    def _companies(self, data: dict) -> list[Record]:
        rows = data.get("rows") or []
        with self._db() as conn:
            with conn.cursor() as cur:
                for r in rows:
                    code = r.get("code")
                    if not code:
                        continue
                    cur.execute(
                        """INSERT INTO dse_securities (code, name, sector, board, category, updated_at)
                           VALUES (%s,%s,%s,%s,%s,now())
                           ON CONFLICT (code) DO UPDATE SET
                             name=COALESCE(EXCLUDED.name,dse_securities.name),
                             sector=COALESCE(EXCLUDED.sector,dse_securities.sector),
                             board=COALESCE(EXCLUDED.board,dse_securities.board),
                             category=COALESCE(EXCLUDED.category,dse_securities.category),
                             updated_at=now()""",
                        (code, r.get("name"), r.get("sector"), r.get("board"), r.get("category")),
                    )
        return []

    def _market_stats(self, data: dict) -> list[Record]:
        session = data.get("session") or {}
        d = _d(session.get("sessionDate") or session.get("date") or date.today())
        tx = data.get("transactions") or {}
        cap = data.get("marketCap") or {}
        cats = data.get("categories") or []
        breadth = next((c for c in cats if c.get("key") == "all"), {})
        with self._db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO dse_market_daily
                         (obs_date, turnover_mn, volume, trades, advances, declines, unchanged,
                          market_cap_equity_mn, market_cap_mf_mn, market_cap_debt_mn,
                          market_cap_total_mn, source, revised_at)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'DSE',now())
                       ON CONFLICT (obs_date) DO UPDATE SET
                         turnover_mn=EXCLUDED.turnover_mn, volume=EXCLUDED.volume,
                         trades=EXCLUDED.trades, advances=EXCLUDED.advances,
                         declines=EXCLUDED.declines, unchanged=EXCLUDED.unchanged,
                         market_cap_equity_mn=EXCLUDED.market_cap_equity_mn,
                         market_cap_mf_mn=EXCLUDED.market_cap_mf_mn,
                         market_cap_debt_mn=EXCLUDED.market_cap_debt_mn,
                         market_cap_total_mn=EXCLUDED.market_cap_total_mn, revised_at=now()""",
                    (d, _f(tx.get("valueMn")), _f(tx.get("volume")), int(tx["trades"]) if tx.get("trades") is not None else None,
                     breadth.get("advanced"), breadth.get("declined"), breadth.get("unchanged"),
                     _f(cap.get("equity")) / 1e6 if cap.get("equity") is not None else None,
                     _f(cap.get("mutualFund")) / 1e6 if cap.get("mutualFund") is not None else None,
                     _f(cap.get("debt")) / 1e6 if cap.get("debt") is not None else None,
                     _f(cap.get("total")) / 1e6 if cap.get("total") is not None else None),
                )
        return []

    def _market_summary(self, data: dict) -> list[Record]:
        ensure_series([s for s in CORE if s["module"] == "market"])
        out: list[Record] = []
        for row in data.get("rows") or []:
            try:
                d = _d(row.get("date"))
            except Exception:
                continue
            mapping = {
                "market.dse.index.dsex": row.get("dsex"),
                "market.dse.index.ds30": row.get("ds30"),
                "market.dse.turnover": row.get("totalValue"),
                "market.dse.volume": row.get("totalVolume"),
                "market.dse.trades": row.get("totalTrade"),
            }
            for sid, v in mapping.items():
                if v is not None:
                    out.append(Record(sid, d, float(v)))
            if row.get("marketCap") is not None:
                out.append(Record("market.dse.market_cap.total", d, float(row["marketCap"]) / 1000.0))
        return out

    class _db:
        def __enter__(self):
            from app import db
            self._cm = db.connection()
            self.conn = self._cm.__enter__()
            return self.conn

        def __exit__(self, *exc):
            return self._cm.__exit__(*exc)
