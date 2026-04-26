/**
 * League season phase from PostgreSQL (`league_seasons`).
 * When a row with is_current = true exists, it drives seasonMeta / postseason toggle.
 * If DB is off or empty, callers fall back to ESPN (seasonTypeCache + probe).
 */

const db = require('../config/db');
const { SEASON_TYPE_NAMES } = require('../config/seasonTypeNames');
const logger = require('../utils/logger');

/** Short TTL so manual `league_seasons` / `is_current` updates show in seasonMeta without long lag. */
const CACHE_TTL_MS = 15 * 1000;
/** @type {{ at: number, value: object | null | undefined }} */
let cache = { at: 0, value: undefined };
// `undefined` = miss; `null` = loaded, no current row; object = current row

/**
 * @returns {Promise<{ ok: boolean, row: object | null, error?: Error }>}
 * `ok: false` means the query failed — do not treat as “no current season” or cache it.
 */
async function fetchCurrentRowFromDb() {
  if (!db.isConfigured) return { ok: false, row: null, error: new Error('Database not configured') };
  try {
    const { rows } = await db.query(
      `SELECT season_year AS "seasonYear",
              is_current AS "isCurrent",
              display_name AS "displayName",
              season_type AS "seasonType",
              season_name AS "seasonName",
              abbreviation,
              updated_at AS "updatedAt"
       FROM league_seasons
       WHERE is_current = true
       LIMIT 1`
    );
    return { ok: true, row: rows[0] || null };
  } catch (err) {
    logger.warn({ component: 'leagueSeasonService', err }, 'league_seasons query failed');
    return { ok: false, row: null, error: err };
  }
}

/**
 * @param {{ skipCache?: boolean }} [options]
 * @returns {Promise<object|null>} Current row, or null if DB off, query failed, or no `is_current` row.
 */
async function getCurrentSeasonRow(options = {}) {
  const { skipCache = false } = options;
  if (!db.isConfigured) return null;
  const now = Date.now();
  if (!skipCache && cache.value !== undefined && now - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }
  const result = await fetchCurrentRowFromDb();
  if (!result.ok) {
    invalidateCache();
    return null;
  }
  cache = { at: now, value: result.row };
  return result.row;
}

function invalidateCache() {
  cache = { at: 0, value: undefined };
}

/**
 * @param {object} row - from getCurrentSeasonRow
 * @param {number} requestedSeasonType
 */
function seasonMetaFromRow(row, requestedSeasonType = 2) {
  const postseasonAvailable = row.seasonType === 3 || row.seasonType === 5;
  return {
    currentSeasonType: row.seasonType,
    currentSeasonTypeName: row.seasonName || SEASON_TYPE_NAMES[row.seasonType] || 'Unknown',
    requestedSeasonType,
    requestedSeasonTypeName: SEASON_TYPE_NAMES[requestedSeasonType] || 'Unknown',
    postseasonAvailable,
  };
}

/**
 * ESPN-shaped payload for GET /app/config (iOS).
 * @param {object} row
 */
function toAppConfigShape(row) {
  return {
    year: row.seasonYear,
    current: true,
    displayName: row.displayName,
    type: row.seasonType,
    name: row.seasonName,
    abbreviation: row.abbreviation,
  };
}

module.exports = {
  getCurrentSeasonRow,
  seasonMetaFromRow,
  toAppConfigShape,
  invalidateCache,
};
