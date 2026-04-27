-- Cached ESPN team basics (read-through from API). ESPN remains source of truth.

CREATE TABLE IF NOT EXISTS teams (
  espn_team_id VARCHAR(32) PRIMARY KEY,
  abbreviation VARCHAR(10) NOT NULL,
  slug VARCHAR(64),
  name VARCHAR(128) NOT NULL,
  city VARCHAR(128),
  logo_url TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teams_abbreviation ON teams (abbreviation);

COMMENT ON TABLE teams IS 'Materialized NBA team basics from ESPN; refreshed on TTL via read-through cache.';
