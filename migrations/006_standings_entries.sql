-- Cached ESPN standings (read-through). One row per team per (season_year, season_type).

CREATE TABLE IF NOT EXISTS standings_snapshot_meta (
  season_year INT NOT NULL,
  season_type SMALLINT NOT NULL,
  season_display_name TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (season_year, season_type)
);

COMMENT ON TABLE standings_snapshot_meta IS 'Top-level standings snapshot metadata for a season/type key.';

CREATE TABLE IF NOT EXISTS standings_entries (
  season_year INT NOT NULL,
  season_type SMALLINT NOT NULL,
  espn_team_id VARCHAR(32) NOT NULL,
  conference_key TEXT NOT NULL,
  conference_id TEXT,
  conference_name TEXT,
  conference_abbreviation TEXT,
  sort_order SMALLINT NOT NULL,
  wins SMALLINT,
  losses SMALLINT,
  win_percent NUMERIC(8, 6),
  games_behind NUMERIC(8, 3),
  playoff_seed SMALLINT,
  home_wins SMALLINT,
  home_losses SMALLINT,
  away_wins SMALLINT,
  away_losses SMALLINT,
  streak SMALLINT,
  streak_display TEXT,
  espn_team_uid TEXT,
  short_display_name TEXT,
  team_location TEXT,
  team_name TEXT,
  team_city TEXT,
  team_abbreviation VARCHAR(10),
  logo_url TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (season_year, season_type, espn_team_id)
);

CREATE INDEX IF NOT EXISTS idx_standings_entries_season ON standings_entries (season_year, season_type);
CREATE INDEX IF NOT EXISTS idx_standings_entries_conf ON standings_entries (season_year, season_type, conference_key);

COMMENT ON TABLE standings_entries IS 'Standings snapshot rows; denormalized team labels for replay without ESPN.';
