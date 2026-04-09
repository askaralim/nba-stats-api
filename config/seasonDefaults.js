/**
 * Default NBA season for ESPN APIs (year = ending year of season, e.g. 2026 = 2025–26).
 * Override with env when the league rolls to a new season.
 *
 * NBA_STANDINGS_SEASON_YEAR — integer (e.g. 2026)
 * NBA_STANDINGS_SEASON_TYPE — 2 regular, 3 playoffs
 * NBA_ESPN_STATS_SEASON — ESPN scraper format e.g. 2026|2
 */

const STANDINGS_YEAR = parseInt(process.env.NBA_STANDINGS_SEASON_YEAR, 10) || 2026;
const STANDINGS_TYPE = parseInt(process.env.NBA_STANDINGS_SEASON_TYPE, 10) || 2;
const ESPN_PLAYER_STATS_SEASON = process.env.NBA_ESPN_STATS_SEASON || '2026|2';

module.exports = {
  STANDINGS_YEAR,
  STANDINGS_TYPE,
  ESPN_PLAYER_STATS_SEASON,
};
