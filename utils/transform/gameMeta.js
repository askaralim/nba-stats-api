/**
 * Game metadata utilities (pure, side-effect-free).
 *
 * Extracted from utils/gameTransformer.js to keep that file focused on
 * orchestration and ESPN response shaping. All functions here operate on
 * already-transformed game objects (gameStatus, awayTeam/homeTeam, period,
 * gameStatusText) — they do NOT touch raw ESPN payloads.
 */

const STATUS_MAP = {
  STATUS_SCHEDULED: 1,
  STATUS_IN_PROGRESS: 2,
  STATUS_FINAL: 3,
  STATUS_FINAL_OVERTIME: 3,
  STATUS_DELAYED: 1,
  STATUS_POSTPONED: 6,
  STATUS_SUSPENDED: 2,
  STATUS_HALFTIME: 2,
  STATUS_END_PERIOD: 2,
};

/**
 * Map ESPN status code to internal status (1=Scheduled, 2=Live, 3=Final, 6=Postponed).
 * @param {string} espnStatus
 * @returns {number}
 */
function mapStatus(espnStatus) {
  return STATUS_MAP[espnStatus] || 1;
}

/**
 * Parse a W-L record string ("24-1") into { wins, losses }.
 * @param {string} summary
 * @returns {{ wins: number, losses: number }}
 */
function parseRecord(summary) {
  if (!summary) return { wins: 0, losses: 0 };
  const [wins, losses] = summary.split('-').map(Number);
  return { wins: wins || 0, losses: losses || 0 };
}

/**
 * ESPN scoreboard `record` is usually an array of { type, summary }.
 * Postseason responses sometimes return a single object instead. Normalize.
 * @param {unknown} recordOrRecords
 * @returns {Array<Object>}
 */
function recordsAsArray(recordOrRecords) {
  if (recordOrRecords == null) return [];
  if (Array.isArray(recordOrRecords)) return recordOrRecords;
  if (typeof recordOrRecords === 'object') return [recordOrRecords];
  return [];
}

const MARQUEE_HEROES = new Set(['GS', 'LAL']);
const MARQUEE_PAIRS = new Set([
  'OKC|DEN', 'DEN|OKC',
  'OKC|SA', 'SA|OKC',
  'DEN|SA', 'SA|DEN',
  'BOS|SA', 'SA|BOS',
]);

/**
 * Returns true for games involving GS/LAL or our hand-picked rivalry list.
 * @param {Object} game
 * @returns {boolean}
 */
function isMarqueeMatchup(game) {
  const awayAbbr = (
    game?.awayTeam?.abbreviation ||
    game?.awayTeam?.teamTricode ||
    game?.awayTeam?.teamAbbreviation ||
    ''
  ).toUpperCase();
  const homeAbbr = (
    game?.homeTeam?.abbreviation ||
    game?.homeTeam?.teamTricode ||
    game?.homeTeam?.teamAbbreviation ||
    ''
  ).toUpperCase();

  if (!awayAbbr || !homeAbbr) return false;
  if (MARQUEE_HEROES.has(awayAbbr) || MARQUEE_HEROES.has(homeAbbr)) return true;
  return MARQUEE_PAIRS.has(`${awayAbbr}|${homeAbbr}`);
}

/**
 * Game went to overtime if period > 4 or status text mentions OT/overtime.
 * Returns truthy/falsy (not strict boolean) to match historical behavior.
 * @param {Object} game
 */
function isOvertimeGame(game) {
  return (
    game?.period > 4 ||
    (game?.gameStatusText && game.gameStatusText.toLowerCase().includes('ot')) ||
    (game?.gameStatusText && game.gameStatusText.toLowerCase().includes('overtime'))
  );
}

/**
 * Score margin for live (status 2) and finished (status 3) games.
 * Returns null for scheduled, missing scores, or 0-0 placeholders.
 * @param {Object} game
 * @returns {number|null}
 */
function getScoreDifference(game) {
  if (game.gameStatus === 1) return null;
  if (game?.awayTeam?.score == null || game?.homeTeam?.score == null) return null;
  if (game.awayTeam.score === 0 && game.homeTeam.score === 0) return null;
  return Math.abs(game.awayTeam.score - game.homeTeam.score);
}

/**
 * True for live/finished games where margin <= 5.
 * @param {Object} game
 * @returns {boolean}
 */
function isClosestGame(game) {
  if (game.gameStatus === 1) return false;
  const scoreDiff = getScoreDifference(game);
  return scoreDiff !== null && scoreDiff <= 5;
}

/**
 * Lower priority value = higher prominence in the GamesToday feed.
 * 1 live marquee, 2 live closest, 3 live OT, 4 live other,
 * 5 closest (any), 6 OT (any), 7 scheduled, 8 finished other.
 * @param {Object} game
 * @returns {number}
 */
function getGamePriority(game) {
  const isLive = game.gameStatus === 2;
  const marquee = isMarqueeMatchup(game);
  const ot = Boolean(isOvertimeGame(game));
  const closest = isClosestGame(game);
  const scheduled = game.gameStatus === 1;
  const finished = game.gameStatus === 3;

  if (isLive && marquee) return 1;
  if (isLive && closest) return 2;
  if (isLive && ot) return 3;
  if (isLive) return 4;
  if (closest) return 5;
  if (ot) return 6;
  if (scheduled) return 7;
  if (finished) return 8;
  return 9;
}

/**
 * Stable-ish sort by priority then by tightest score margin.
 * @param {Array<Object>} games
 * @returns {Array<Object>}
 */
function sortGamesByPriority(games) {
  if (!games || games.length === 0) return [];
  return [...games].sort((a, b) => {
    const priorityA = getGamePriority(a);
    const priorityB = getGamePriority(b);
    if (priorityA !== priorityB) return priorityA - priorityB;
    const scoreDiffA = getScoreDifference(a);
    const scoreDiffB = getScoreDifference(b);
    if (scoreDiffA !== null && scoreDiffB !== null) return scoreDiffA - scoreDiffB;
    return 0;
  });
}

module.exports = {
  mapStatus,
  parseRecord,
  recordsAsArray,
  isMarqueeMatchup,
  isOvertimeGame,
  getScoreDifference,
  isClosestGame,
  getGamePriority,
  sortGamesByPriority,
};
