/**
 * Persistence for cached ESPN team rows (teams table).
 * No-op when DATABASE_URL / PG* is not configured (same semantics as config/db.js).
 */

const db = require('../config/db');

/**
 * @param {string} espnTeamId - ESPN numeric id as string
 * @returns {Promise<import('pg').QueryResultRow|null>}
 */
async function getByEspnTeamId(espnTeamId) {
  if (!db.isConfigured) return null;
  const { rows } = await db.query(
    `SELECT espn_team_id, abbreviation, slug, name, city, logo_url, fetched_at, updated_at
     FROM teams WHERE espn_team_id = $1`,
    [String(espnTeamId)]
  );
  return rows[0] ?? null;
}

/**
 * All cached team rows (for full-list read-through).
 * @returns {Promise<import('pg').QueryResultRow[]>}
 */
async function listAll() {
  if (!db.isConfigured) return [];
  const { rows } = await db.query(
    `SELECT espn_team_id, abbreviation, slug, name, city, logo_url, fetched_at, updated_at
     FROM teams`
  );
  return rows;
}

/**
 * @param {object} team
 * @param {string} team.espn_team_id
 * @param {string} team.abbreviation
 * @param {string|null} [team.slug]
 * @param {string} team.name
 * @param {string|null} [team.city]
 * @param {string|null} [team.logo_url]
 */
async function upsertTeam(team) {
  if (!db.isConfigured) return;
  const {
    espn_team_id,
    abbreviation,
    slug,
    name,
    city,
    logo_url,
  } = team;
  await db.query(
    `INSERT INTO teams (espn_team_id, abbreviation, slug, name, city, logo_url, fetched_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     ON CONFLICT (espn_team_id)
     DO UPDATE SET
       abbreviation = EXCLUDED.abbreviation,
       slug = EXCLUDED.slug,
       name = EXCLUDED.name,
       city = EXCLUDED.city,
       logo_url = EXCLUDED.logo_url,
       fetched_at = NOW(),
       updated_at = NOW()`,
    [
      String(espn_team_id),
      abbreviation,
      slug ?? null,
      name,
      city ?? null,
      logo_url ?? null,
    ]
  );
}

module.exports = {
  getByEspnTeamId,
  listAll,
  upsertTeam,
};
