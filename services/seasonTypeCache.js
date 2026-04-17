/**
 * Season Type Cache
 *
 * Lightweight singleton that stores the current NBA season type.
 * Updated opportunistically by any ESPN API call that returns season metadata.
 *
 * ESPN season type mapping:
 *   1 = Pre-Season
 *   2 = Regular Season
 *   3 = Postseason (Playoffs)
 *   4 = Off-Season
 *   5 = Play-In Tournament
 */

const { SEASON_TYPE_NAMES } = require('../config/seasonTypeNames');

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let cached = null; // { type, name, year, updatedAt }

/**
 * Normalize ESPN season type field (number, string, or { type, id } object).
 * @param {unknown} raw
 * @returns {number|null}
 */
function normalizeSeasonTypeId(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof raw === 'object') {
    const v = raw.type ?? raw.id;
    if (v === undefined || v === null) return null;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = parseInt(String(v), 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Extract season type from various ESPN API response shapes.
 *
 * Known patterns:
 *   A) { season: { type: 5, year: 2026 } }                       — Scoreboard
 *   B) { currentSeason: { type: { type: 5, name: "..." } } }     — Leaders
 *   C) { season: { type: 5, name: "Play-In Season", year: 2026 } } — Roster / misc
 *   D) { leagues: [{ season: { type: 5, year: 2026 } }] }        — Some endpoints
 *
 * @param {Object} data – raw ESPN API JSON
 * @returns {{ type: number, name: string|null, year: number|null } | null}
 */
function extractSeasonType(data) {
  if (!data || typeof data !== 'object') return null;

  // Pattern B – leaders API (currentSeason.type may be object or number)
  if (data.currentSeason?.type !== undefined && data.currentSeason?.type !== null) {
    const t = data.currentSeason.type;
    const typeId = normalizeSeasonTypeId(typeof t === 'object' ? t : { type: t });
    if (typeId !== null) {
      const name = typeof t === 'object' && t && typeof t.name === 'string' ? t.name : null;
      return {
        type: typeId,
        name,
        year: data.currentSeason.year || null,
      };
    }
  }

  // Pattern A / C – season.type as number or nested object
  if (data.season?.type !== undefined && data.season?.type !== null) {
    const s = data.season;
    const typeId = normalizeSeasonTypeId(s.type);
    if (typeId !== null) {
      return {
        type: typeId,
        name: typeof s.name === 'string' ? s.name : null,
        year: s.year || null,
      };
    }
  }

  // Pattern D – leagues array
  if (Array.isArray(data.leagues) && data.leagues[0]?.season?.type !== undefined) {
    const s = data.leagues[0].season;
    const typeId = normalizeSeasonTypeId(s.type);
    if (typeId !== null) {
      return {
        type: typeId,
        name: typeof s.name === 'string' ? s.name : null,
        year: s.year || null,
      };
    }
  }

  return null;
}

module.exports = {
  /**
   * Update cache from any ESPN API response.
   * Safe to call on every ESPN fetch — only writes when season info is present.
   */
  updateFromResponse(espnData) {
    const extracted = extractSeasonType(espnData);
    if (!extracted || !Number.isFinite(extracted.type)) return;

    cached = {
      ...extracted,
      updatedAt: Date.now(),
    };

    console.log(
      `[seasonTypeCache] Updated: type=${cached.type} (${cached.name || '?'}), year=${cached.year}`
    );
  },

  /**
   * Get the cached season type info.
   * Returns null if cache is cold or expired.
   * @returns {{ type: number, name: string|null, year: number|null } | null}
   */
  get() {
    if (!cached) return null;
    if (Date.now() - cached.updatedAt > CACHE_TTL_MS) {
      cached = null;
      return null;
    }
    return { type: cached.type, name: cached.name, year: cached.year };
  },

  /**
   * Build a seasonMeta object suitable for API responses.
   * @param {number} requestedSeasonType – the season type that was actually queried
   * @param {boolean} postseasonAvailable – whether postseason data can be fetched
   * @returns {Object}
   */
  buildSeasonMeta(requestedSeasonType = 2, postseasonAvailable = false) {
    const current = this.get();
    return {
      currentSeasonType: current?.type ?? null,
      currentSeasonTypeName: current ? (current.name || SEASON_TYPE_NAMES[current.type] || 'Unknown') : null,
      requestedSeasonType,
      requestedSeasonTypeName: SEASON_TYPE_NAMES[requestedSeasonType] || 'Unknown',
      postseasonAvailable,
    };
  },

  /** Reset cache (for testing) */
  _reset() {
    cached = null;
  },
};
