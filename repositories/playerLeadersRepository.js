/**
 * Cached player leaders snapshots (player_leaders_snapshot_meta + player_leaders_entries).
 */

const db = require('../config/db');

/**
 * @param {number} seasonYear
 * @param {number} seasonType
 * @param {number} leadersLimit
 * @returns {Promise<import('pg').QueryResultRow|null>}
 */
async function getMeta(seasonYear, seasonType, leadersLimit) {
  if (!db.isConfigured) {
    return null;
  }
  const { rows } = await db.query(
    `SELECT season_year, season_type, leaders_limit, effective_season_type_id,
            season_label, season_type_display, position_label, total_count, fetched_at
     FROM player_leaders_snapshot_meta
     WHERE season_year = $1 AND season_type = $2 AND leaders_limit = $3`,
    [seasonYear, seasonType, leadersLimit]
  );
  return rows[0] ?? null;
}

/**
 * @param {number} seasonYear
 * @param {number} seasonType
 * @param {number} leadersLimit
 * @returns {Promise<import('pg').QueryResultRow[]>}
 */
async function listEntries(seasonYear, seasonType, leadersLimit) {
  if (!db.isConfigured) return [];
  const { rows } = await db.query(
    `SELECT season_year, season_type, leaders_limit, stat_key, rank, player_json, fetched_at
     FROM player_leaders_entries
     WHERE season_year = $1 AND season_type = $2 AND leaders_limit = $3
     ORDER BY stat_key ASC, rank ASC`,
    [seasonYear, seasonType, leadersLimit]
  );
  return rows;
}

/**
 * Replace meta + all entries for (season_year, season_type, leaders_limit) in one transaction.
 * @param {object} meta
 * @param {object[]} entries - rows with stat_key, rank, player_json (season_* / leaders_limit set from meta)
 */
async function replaceSnapshot(meta, entries) {
  if (!db.isConfigured) {
    return;
  }
  const client = await db.getClient();
  if (!client) return;

  const {
    season_year: seasonYear,
    season_type: seasonType,
    leaders_limit: leadersLimit,
    effective_season_type_id: effectiveSeasonTypeId,
    season_label: seasonLabel,
    season_type_display: seasonTypeDisplay,
    position_label: positionLabel,
    total_count: totalCount,
  } = meta;

  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM player_leaders_entries
       WHERE season_year = $1 AND season_type = $2 AND leaders_limit = $3`,
      [seasonYear, seasonType, leadersLimit]
    );
    await client.query(
      `DELETE FROM player_leaders_snapshot_meta
       WHERE season_year = $1 AND season_type = $2 AND leaders_limit = $3`,
      [seasonYear, seasonType, leadersLimit]
    );
    await client.query(
      `INSERT INTO player_leaders_snapshot_meta (
        season_year, season_type, leaders_limit, effective_season_type_id,
        season_label, season_type_display, position_label, total_count, fetched_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        seasonYear,
        seasonType,
        leadersLimit,
        effectiveSeasonTypeId,
        seasonLabel ?? null,
        seasonTypeDisplay ?? null,
        positionLabel ?? null,
        totalCount ?? null,
      ]
    );

    const insertSql = `INSERT INTO player_leaders_entries (
      season_year, season_type, leaders_limit, stat_key, rank, player_json, fetched_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`;

    for (const e of entries) {
      await client.query(insertSql, [
        seasonYear,
        seasonType,
        leadersLimit,
        e.stat_key,
        e.rank,
        e.player_json,
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
