-- Canonical NBA calendar phase (manual updates on Railway).
-- App reads the row WHERE is_current = true. ESPN-style fields for clients.

CREATE TABLE IF NOT EXISTS league_seasons (
  id SERIAL PRIMARY KEY,
  season_year INT NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT false,
  display_name TEXT NOT NULL,
  season_type SMALLINT NOT NULL,
  season_name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS league_seasons_one_current
  ON league_seasons (is_current)
  WHERE is_current = true;

CREATE UNIQUE INDEX IF NOT EXISTS league_seasons_year_type
  ON league_seasons (season_year, season_type);

COMMENT ON TABLE league_seasons IS 'NBA phases; flip is_current when league moves (regular / play-in / postseason).';

INSERT INTO league_seasons (season_year, is_current, display_name, season_type, season_name, abbreviation)
VALUES
  (2026, true,  '2025-26', 2, 'Regular Season', 'regular'),
  (2026, false, '2025-26', 5, 'Play-In Season', 'playin'),
  (2026, false, '2025-26', 3, 'Postseason', 'playoff')
ON CONFLICT (season_year, season_type) DO NOTHING;

UPDATE league_seasons SET is_current = (season_year = 2026 AND season_type = 2)
WHERE season_year = 2026;
