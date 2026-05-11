-- Cached ESPN player leaders (read-through), keyed by season year, requested season type, and leaders API limit.

CREATE TABLE IF NOT EXISTS player_leaders_snapshot_meta (
  season_year INT NOT NULL,
  season_type SMALLINT NOT NULL,
  leaders_limit INT NOT NULL,
  effective_season_type_id SMALLINT NOT NULL,
  season_label TEXT,
  season_type_display TEXT,
  position_label TEXT,
  total_count INT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (season_year, season_type, leaders_limit)
);

COMMENT ON TABLE player_leaders_snapshot_meta IS 'Snapshot metadata for player stat leaders (GET /nba/stats/players). season_type is the requested type from the client season param.';

CREATE TABLE IF NOT EXISTS player_leaders_entries (
  season_year INT NOT NULL,
  season_type SMALLINT NOT NULL,
  leaders_limit INT NOT NULL,
  stat_key VARCHAR(64) NOT NULL,
  rank SMALLINT NOT NULL,
  player_json JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (season_year, season_type, leaders_limit, stat_key, rank)
);

CREATE INDEX IF NOT EXISTS idx_player_leaders_entries_season ON player_leaders_entries (season_year, season_type, leaders_limit);

COMMENT ON TABLE player_leaders_entries IS 'Per-category ranked players; player_json matches API player objects under topPlayersByStat.';
