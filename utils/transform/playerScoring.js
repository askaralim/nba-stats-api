/**
 * Player scoring utilities (Game Impact Score and Game MVP).
 *
 * Pure functions: take already-shaped player objects (with .stats and team
 * metadata) and return numeric/object results. No ESPN coupling.
 */

const { formatPlayerNameForDisplay } = require('../playerName');

/**
 * Game Impact Score (GIS).
 * Inspired by Hollinger Game Score, with bonuses/penalties tuned for our UX.
 * @param {Object} player - Player with .stats matching ESPN boxscore shape
 * @param {boolean} teamWon - Whether this player's team won
 * @returns {number}
 */
function calculateGIS(player, teamWon) {
  if (!player?.stats) return 0;

  const pts = parseInt(player.stats.points) || 0;
  const reb = parseInt(player.stats.rebounds) || 0;
  const ast = parseInt(player.stats.assists) || 0;
  const stl = parseInt(player.stats.steals) || 0;
  const blk = parseInt(player.stats.blocks) || 0;
  const tov = parseInt(player.stats.turnovers) || 0;
  const fouls = parseInt(player.stats.fouls) || 0;

  const fga = parseInt(player.stats.fieldGoals ? player.stats.fieldGoals.split('-')[1] : 0) || 0;
  const fgm = parseInt(player.stats.fieldGoals ? player.stats.fieldGoals.split('-')[0] : 0) || 0;

  const fta = parseInt(player.stats.freeThrows ? player.stats.freeThrows.split('-')[1] : 0) || 0;
  const ftm = parseInt(player.stats.freeThrows ? player.stats.freeThrows.split('-')[0] : 0) || 0;

  const dreb = parseInt(player.stats.defensiveRebounds) || 0;

  const threePM = parseInt(player.stats.threePointers ? player.stats.threePointers.split('-')[0] : 0) || 0;
  const threePA = parseInt(player.stats.threePointers ? player.stats.threePointers.split('-')[1] : 0) || 0;

  let score =
    (1.0 * pts) +
    (1.2 * reb) +
    (1.2 * ast) +
    (2.0 * stl) +
    (1.6 * blk) +
    (
      (0.6 * fgm) - (0.5 * (fga - fgm)) +
      (0.2 * ftm) - (0.4 * (fta - ftm)) +
      (0.7 * threePM) - (0.6 * (threePA - threePM))
    ) +
    (ast * 0.3 - tov * 1.5) +
    (stl * 0.5 + blk * 0.4 + dreb * 0.3) -
    (tov * 0.5 + fouls * 0.5);

  if (teamWon) {
    score += 2;
  }

  const fgPct = fga > 0 ? fgm / fga : 0;
  if ((pts + ast > 40) && (fgPct > 0.5)) {
    score += 2;
  }

  if (pts > 10 && reb > 10 && ast > 10) {
    score += 3;
  }

  if (pts >= 40 && fgPct > 0.6) {
    score += 6;
  }

  if (ast >= 12) {
    score += 2;
  }

  if (reb >= 15) {
    score += 2;
  }

  if (stl >= 4 || blk >= 4) {
    score += 2;
  }

  if (fgPct < 0.35 && fga > 10) {
    score -= 5;
  }

  if (fgPct > 0.6 && fga > 15) {
    score += 4;
  }

  return Number(score.toFixed(1));
}

/**
 * Game MVP ("Who carried?") — highest GIS player on the winning team.
 * Falls back to the union of all players if the winning team has no eligible
 * (non-DNP) players. Returns null when given an empty roster.
 *
 * @param {Array<Object>} allPlayers - All players from both teams
 * @param {Array<Object>} teams - Teams array with .id, .abbreviation, .name, .logo
 * @param {string|null} winningTeamId - ID of the winning team (null if tie or undecided)
 * @returns {Object|null}
 */
function calculateGameMVP(allPlayers, teams = [], winningTeamId) {
  if (!allPlayers || allPlayers.length === 0) {
    return null;
  }

  let eligiblePlayers = allPlayers;
  if (winningTeamId) {
    eligiblePlayers = allPlayers.filter(
      (player) => String(player.teamId) === String(winningTeamId)
    );
    if (eligiblePlayers.length === 0) {
      eligiblePlayers = allPlayers;
    }
  }

  let gameMVP = null;
  let highestGIS = -Infinity;

  eligiblePlayers.forEach((player) => {
    if (player.didNotPlay) return;
    const gis = calculateGIS(player, winningTeamId === player.teamId);

    if (gis > highestGIS) {
      highestGIS = gis;
      const playerTeam = teams.find((t) => String(t.id) === String(player.teamId));

      gameMVP = {
        athleteId: player.athleteId,
        name: formatPlayerNameForDisplay(player.name || ''),
        shortName: player.shortName,
        jersey: player.jersey,
        position: player.position,
        headshot: player.headshot,
        teamId: player.teamId,
        teamAbbreviation: playerTeam?.abbreviation || '',
        teamName: playerTeam?.name || '',
        teamLogo: playerTeam?.logo || '',
        gis: Math.round(gis * 10) / 10,
        stats: {
          points: player.stats.points || 0,
          rebounds: player.stats.rebounds || 0,
          assists: player.stats.assists || 0,
          steals: player.stats.steals || 0,
          blocks: player.stats.blocks || 0,
          turnovers: player.stats.turnovers || 0,
        },
      };
    }
  });

  return gameMVP;
}

module.exports = {
  calculateGIS,
  calculateGameMVP,
};
