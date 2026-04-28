/**
 * Cached standings snapshots (standings_snapshot_meta + standings_entries).
 */

const db = require('../config/db');

/**
 * @param {number} seasonYear
 * @param {number} seasonType
 * @returns {Promise<import('pg').QueryResultRow|null>}
 */
async function getMeta(seasonYear, seasonType) {
  if (!db.isConfigured) return null;
  const { rows } = await db.query(
    `SELECT season_year, season_type, season_display_name, fetched_at
     FROM standings_snapshot_meta WHERE season_year = $1 AND season_type = $2`,
    [seasonYear, seasonType]
  );
  return rows[0] ?? null;
}

/**
 * @param {number} seasonYear
 * @param {number} seasonType
 * @returns {Promise<import('pg').QueryResultRow[]>}
 */
async function listEntries(seasonYear, seasonType) {
  if (!db.isConfigured) return [];
  const { rows } = await db.query(
    `SELECT season_year, season_type, espn_team_id, conference_key, conference_id, conference_name,
            conference_abbreviation, sort_order, wins, losses, win_percent, games_behind, playoff_seed,
            home_wins, home_losses, away_wins, away_losses, streak, streak_display,
            espn_team_uid, short_display_name, team_location, team_name, team_city, team_abbreviation, logo_url,
            fetched_at, updated_at
     FROM standings_entries
     WHERE season_year = $1 AND season_type = $2
     ORDER BY conference_key ASC, sort_order ASC`,
    [seasonYear, seasonType]
  );
  return rows;
}

/**
 * Replace meta + all entries for a season key in one transaction.
 * @param {object} params
 * @param {number} params.seasonYear
 * @param {number} params.seasonType
 * @param {string|null} params.seasonDisplayName
 * @param {object[]} params.entries - rows matching standings_entries columns (without fetched_at defaults ok)
 */
async function replaceSnapshot({ seasonYear, seasonType, seasonDisplayName, entries }) {
  if (!db.isConfigured) return;
  const client = await db.getClient();
  if (!client) return;

  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM standings_entries WHERE season_year = $1 AND season_type = $2`,
      [seasonYear, seasonType]
    );
    await client.query(
      `DELETE FROM standings_snapshot_meta WHERE season_year = $1 AND season_type = $2`,
      [seasonYear, seasonType]
    );
    await client.query(
      `INSERT INTO standings_snapshot_meta (season_year, season_type, season_display_name, fetched_at)
       VALUES ($1, $2, $3, NOW())`,
      [seasonYear, seasonType, seasonDisplayName ?? null]
    );

    const insertSql = `INSERT INTO standings_entries (
      season_year, season_type, espn_team_id, conference_key, conference_id, conference_name, conference_abbreviation,
      sort_order, wins, losses, win_percent, games_behind, playoff_seed,
      home_wins, home_losses, away_wins, away_losses, streak, streak_display,
      espn_team_uid, short_display_name, team_location, team_name, team_city, team_abbreviation, logo_url,
      fetched_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, NOW(), NOW()
    )`;

    for (const e of entries) {
      await client.query(insertSql, [
        e.season_year,
        e.season_type,
        e.espn_team_id,
        e.conference_key,
        e.conference_id ?? null,
        e.conference_name ?? null,
        e.conference_abbreviation ?? null,
        e.sort_order,
        e.wins ?? null,
        e.losses ?? null,
        e.win_percent ?? null,
        e.games_behind ?? null,
        e.playoff_seed ?? null,
        e.home_wins ?? null,
        e.home_losses ?? null,
        e.away_wins ?? null,
        e.away_losses ?? null,
        e.streak ?? null,
        e.streak_display ?? null,
        e.espn_team_uid ?? null,
        e.short_display_name ?? null,
        e.team_location ?? null,
        e.team_name ?? null,
        e.team_city ?? null,
        e.team_abbreviation ?? null,
        e.logo_url ?? null,
      ]);
    }

    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_rb) {
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getMeta,
  listEntries,
  replaceSnapshot,
};
