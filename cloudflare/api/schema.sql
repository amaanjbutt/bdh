-- D1 (SQLite) schema for the Cloudflare read API.
-- Mirrors the Postgres series store closely enough that the public API contract
-- is unchanged: JSON dimensions are stored as TEXT, dates/timestamps as ISO
-- strings, booleans as 0/1.

CREATE TABLE IF NOT EXISTS series (
  id            TEXT PRIMARY KEY,
  module        TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  unit          TEXT,
  frequency     TEXT NOT NULL,
  source        TEXT NOT NULL,
  source_url    TEXT,
  dimensions    TEXT NOT NULL DEFAULT '{}',
  min_value     REAL,
  max_value     REAL,
  max_step      REAL,
  first_date    TEXT,
  last_date     TEXT,
  tier          TEXT NOT NULL DEFAULT 'basic',
  is_active     INTEGER NOT NULL DEFAULT 1,
  derivation    TEXT,
  canonical_id  TEXT
);
CREATE INDEX IF NOT EXISTS idx_series_module ON series(module, id);
CREATE INDEX IF NOT EXISTS idx_series_source ON series(source, id);
CREATE INDEX IF NOT EXISTS idx_series_last_date ON series(last_date DESC);

CREATE TABLE IF NOT EXISTS observations (
  series_id     TEXT NOT NULL,
  obs_date      TEXT NOT NULL,
  value         REAL,
  dims          TEXT NOT NULL DEFAULT '{}',
  flagged       INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT,
  revised_at    TEXT,
  PRIMARY KEY (series_id, obs_date, dims)
);
CREATE INDEX IF NOT EXISTS idx_obs_series_date ON observations(series_id, obs_date DESC);
CREATE INDEX IF NOT EXISTS idx_obs_date ON observations(obs_date DESC);

CREATE TABLE IF NOT EXISTS observation_revisions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id     TEXT NOT NULL,
  obs_date      TEXT NOT NULL,
  dims          TEXT NOT NULL DEFAULT '{}',
  value         REAL,
  superseded_at TEXT NOT NULL,
  source        TEXT
);
CREATE INDEX IF NOT EXISTS idx_rev_series ON observation_revisions(series_id, obs_date, superseded_at);

-- Same semantics as the Postgres BEFORE UPDATE trigger: record the prior value
-- only when it actually changes.
CREATE TRIGGER IF NOT EXISTS trg_observation_revision
AFTER UPDATE OF value ON observations
FOR EACH ROW
WHEN OLD.value IS NOT NEW.value
BEGIN
  INSERT INTO observation_revisions (series_id, obs_date, dims, value, superseded_at)
  VALUES (OLD.series_id, OLD.obs_date, OLD.dims, OLD.value,
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TABLE IF NOT EXISTS observation_notes (
  series_id TEXT NOT NULL,
  obs_date  TEXT NOT NULL,
  dims      TEXT NOT NULL DEFAULT '{}',
  note      TEXT NOT NULL,
  kind      TEXT,
  PRIMARY KEY (series_id, obs_date, dims)
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  job_name      TEXT NOT NULL,
  started_at    TEXT,
  finished_at   TEXT,
  status        TEXT,
  rows_upserted INTEGER NOT NULL DEFAULT 0,
  error         TEXT,
  raw_file      TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_job_time ON ingestion_runs(job_name, started_at DESC);

CREATE TABLE IF NOT EXISTS fund_registry (
  name               TEXT PRIMARY KEY,
  fund_type          TEXT NOT NULL,
  consent_date       TEXT,
  subscription_open  TEXT,
  subscription_close TEXT,
  nrb_close          TEXT,
  amount_crore       REAL,
  document_url       TEXT,
  source             TEXT NOT NULL DEFAULT 'BSEC',
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fund_registry_type ON fund_registry(fund_type);

CREATE TABLE IF NOT EXISTS dam_prices (
  price_date    TEXT NOT NULL,
  division      TEXT NOT NULL,
  commodity     TEXT NOT NULL,
  unit          TEXT NOT NULL,
  current_min   REAL,
  current_max   REAL,
  month_ago_min REAL,
  month_ago_max REAL,
  year_ago_min  REAL,
  year_ago_max  REAL,
  source        TEXT NOT NULL DEFAULT 'DAM',
  revised_at    TEXT NOT NULL,
  PRIMARY KEY (price_date, division, commodity, unit)
);
CREATE INDEX IF NOT EXISTS idx_dam_date ON dam_prices(price_date DESC);
CREATE INDEX IF NOT EXISTS idx_dam_division ON dam_prices(division, commodity, price_date DESC);

CREATE TABLE IF NOT EXISTS dse_securities (
  code       TEXT PRIMARY KEY,
  name       TEXT,
  sector     TEXT,
  board      TEXT,
  category   TEXT,
  asset_type TEXT,
  is_active  INTEGER NOT NULL DEFAULT 1,
  first_seen TEXT,
  last_seen  TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_dse_sec_sector ON dse_securities(sector);
CREATE INDEX IF NOT EXISTS idx_dse_sec_type ON dse_securities(asset_type);

CREATE TABLE IF NOT EXISTS dse_prices (
  code       TEXT NOT NULL,
  obs_date   TEXT NOT NULL,
  ltp        REAL,
  ycp        REAL,
  open       REAL,
  high       REAL,
  low        REAL,
  close      REAL,
  volume     REAL,
  value_mn   REAL,
  trades     INTEGER,
  change_pct REAL,
  revised_at TEXT,
  PRIMARY KEY (code, obs_date)
);
CREATE INDEX IF NOT EXISTS idx_dse_prices_date ON dse_prices(obs_date DESC);
CREATE INDEX IF NOT EXISTS idx_dse_prices_code ON dse_prices(code, obs_date DESC);

CREATE TABLE IF NOT EXISTS dse_indices (
  index_code TEXT NOT NULL,
  obs_date   TEXT NOT NULL,
  value      REAL,
  change     REAL,
  change_pct REAL,
  revised_at TEXT,
  PRIMARY KEY (index_code, obs_date)
);
CREATE INDEX IF NOT EXISTS idx_dse_indices_date ON dse_indices(obs_date DESC);

CREATE TABLE IF NOT EXISTS dse_market_daily (
  obs_date             TEXT PRIMARY KEY,
  turnover_mn          REAL,
  volume               REAL,
  trades               INTEGER,
  advances             INTEGER,
  declines             INTEGER,
  unchanged            INTEGER,
  market_cap_equity_mn REAL,
  market_cap_mf_mn     REAL,
  market_cap_debt_mn   REAL,
  market_cap_total_mn  REAL,
  source               TEXT NOT NULL DEFAULT 'DSE',
  revised_at           TEXT
);

CREATE TABLE IF NOT EXISTS release_calendar (
  release_date TEXT NOT NULL,
  indicator    TEXT NOT NULL,
  source       TEXT NOT NULL,
  series_id    TEXT,
  actual_value REAL,
  PRIMARY KEY (release_date, indicator)
);
CREATE INDEX IF NOT EXISTS idx_calendar_date ON release_calendar(release_date);

CREATE TABLE IF NOT EXISTS auctions (
  auction_type    TEXT NOT NULL,
  tenor           TEXT NOT NULL,
  auction_date    TEXT NOT NULL,
  settlement_date TEXT,
  cutoff_yield    REAL,
  offered_amount  REAL,
  accepted_amount REAL,
  bid_to_cover    REAL,
  source          TEXT NOT NULL DEFAULT 'BB',
  revised_at      TEXT,
  PRIMARY KEY (auction_type, tenor, auction_date)
);
CREATE INDEX IF NOT EXISTS idx_auctions_type_date ON auctions(auction_type, auction_date DESC);

CREATE TABLE IF NOT EXISTS users (
  id                    TEXT PRIMARY KEY,
  email                 TEXT UNIQUE NOT NULL,
  created_at            TEXT,
  plan                  TEXT NOT NULL DEFAULT 'none',
  subscription_status   TEXT,
  period_end            TEXT,
  credits_remaining     INTEGER NOT NULL DEFAULT 500,
  credits_period        TEXT
);

CREATE TABLE IF NOT EXISTS api_keys (
  key_hash      TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  label         TEXT,
  created_at    TEXT,
  revoked_at    TEXT,
  id            TEXT,
  key_prefix    TEXT,
  last_used_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

CREATE TABLE IF NOT EXISTS sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT
);

INSERT OR IGNORE INTO sync_state (key, value) VALUES ('schema_version', '1');
