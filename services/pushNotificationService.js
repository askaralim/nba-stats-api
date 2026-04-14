/**
 * Expo push: register device tokens and send scheduled alerts
 * (close games in last ~5 min of Q4/OT, MVP GIS when a game ends).
 *
 * Storage:
 * - When PostgreSQL is configured (DATABASE_URL / PG*), tokens are stored in `push_tokens`
 *   (see migrations/003_create_push_tokens.sql). All instances share the same list; survives deploys.
 * - Without DB, tokens are kept in an in-memory Set only (lost on restart; not shared across instances).
 *
 * Env:
 * - DISABLE_PUSH_CRON=true — skip scheduled push checks (use until APNs/Expo push is validated).
 * - PUSH_MVP_MIN_GIS — minimum GIS to send “本场最佳” (default 30).
 */

const db = require('../config/db');
const nbaService = require('./nbaService');
const gameTransformer = require('../utils/gameTransformer');
const { formatPlayerNameForDisplay } = require('../utils/playerName');
const { getTeamNameZhCn } = require('../utils/teamTranslations');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_MEMORY_TOKENS = 10000;

/** In-memory fallback when DB is off @type {Set<string>} */
const memoryTokens = new Set();
/** @type {Set<string>} */
const closeGameAlerted = new Set();
/** @type {Set<string>} */
const mvpNotified = new Set();

/**
 * @param {string} token
 * @param {string} platform
 */
async function registerToken(token, platform) {
  const t = (token || '').trim();
  if (t.length < 10) return;

  if (db.isConfigured) {
    try {
      await db.query(
        `INSERT INTO push_tokens (token, platform, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (token) DO UPDATE SET
           platform = COALESCE(EXCLUDED.platform, push_tokens.platform),
           updated_at = NOW()`,
        [t, platform || null]
      );
      return;
    } catch (e) {
      console.error('[Push] DB register failed (run migrations/003 if missing):', e.message);
    }
  }

  if (memoryTokens.size >= MAX_MEMORY_TOKENS && !memoryTokens.has(t)) {
    const first = memoryTokens.values().next().value;
    memoryTokens.delete(first);
  }
  memoryTokens.add(t);
}

async function getRecipientTokens() {
  if (db.isConfigured) {
    try {
      const { rows } = await db.query('SELECT token FROM push_tokens');
      return rows.map((r) => r.token).filter(Boolean);
    } catch (e) {
      console.error('[Push] Failed to load tokens from DB:', e.message);
      return Array.from(memoryTokens);
    }
  }
  return Array.from(memoryTokens);
}

/**
 * @returns {Promise<number>}
 */
async function getTokenCount() {
  if (db.isConfigured) {
    try {
      const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM push_tokens');
      return rows[0]?.n ?? 0;
    } catch {
      return memoryTokens.size;
    }
  }
  return memoryTokens.size;
}

function parseClockToSeconds(clock) {
  if (!clock || typeof clock !== 'string') return null;
  const t = clock.trim();
  if (/^end$/i.test(t)) return 0;
  const parts = t.split(':');
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const s = parseInt(parts[1], 10);
    if (!Number.isNaN(m) && !Number.isNaN(s)) return m * 60 + s;
  }
  return null;
}

const PUSH_CHUNK = 80;

async function sendExpoPush(messages) {
  if (!messages.length) return;
  for (let i = 0; i < messages.length; i += PUSH_CHUNK) {
    const chunk = messages.slice(i, i + PUSH_CHUNK);
    const body = JSON.stringify(chunk.length === 1 ? chunk[0] : chunk);
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[Push] Expo send failed:', res.status, text.slice(0, 200));
    }
  }
}

async function broadcastToAll(title, body, data) {
  const recipients = await getRecipientTokens();
  if (!recipients.length) return;
  const messages = recipients.map((to) => ({
    to,
    sound: 'default',
    title,
    body,
    data: data || {},
  }));
  return sendExpoPush(messages);
}

async function getTopGisPlayerForGame(gameId) {
  try {
    const { summaryData } = await nbaService.getGameDetails(gameId);
    if (!summaryData?.boxscore) return null;
    const boxscore = gameTransformer.transformBoxscore(summaryData.boxscore);
    if (!boxscore?.teams) return null;

    let best = null;
    for (const team of boxscore.teams) {
      const starters = team.starters || [];
      const bench = team.bench || [];
      const teamPlayers = [...starters, ...bench].filter((p) => !p.didNotPlay);
      for (const player of teamPlayers) {
        if (player.gis == null) continue;
        const gis = Number(player.gis);
        if (!best || gis > best.gis) {
          best = {
            gis,
            playerId: player.athleteId ? String(player.athleteId) : null,
            name: formatPlayerNameForDisplay(player.name || player.shortName || ''),
            teamAbbreviation: team.abbreviation || '',
            teamNameZhCN: getTeamNameZhCn(team.name),
          };
        }
      }
    }
    return best;
  } catch (e) {
    console.warn(`[Push] getTopGisForGame ${gameId}:`, e.message);
    return null;
  }
}

async function runScheduledChecks() {
  if (process.env.DISABLE_PUSH_CRON === 'true') return;

  const recipientCount = await getTokenCount();
  if (recipientCount === 0) return;

  const dateKey = nbaService.formatDateForAPI(new Date());

  let scoreboardData;
  try {
    scoreboardData = await nbaService.getScoreboard(dateKey);
  } catch (e) {
    console.warn('[Push] scoreboard failed:', e.message);
    return;
  }

  const transformed = gameTransformer.transformScoreboard(scoreboardData, true);
  const games = transformed.games || [];

  for (const game of games) {
    const gameId = game.gameId;
    if (!gameId) continue;

    const away = game.awayTeam?.abbreviation || '';
    const home = game.homeTeam?.abbreviation || '';
    const label = `${away} @ ${home}`;

    if (game.gameStatus === 2 && game.period >= 4) {
      const sec = parseClockToSeconds(game.gameClock);
      if (sec !== null && sec <= 300) {
        const key = `${dateKey}_${gameId}_close`;
        if (!closeGameAlerted.has(key)) {
          closeGameAlerted.add(key);
          await broadcastToAll(
            '末节关键时刻',
            `${label} 剩余不到 5 分钟，比分仍胶着。点击查看`,
            { type: 'close_game', gameId: String(gameId) }
          );
          console.log(`[Push] close-game alert ${gameId}`);
        }
      }
    }

    if (game.gameStatus === 3) {
      const key = `${dateKey}_${gameId}_mvp`;
      if (!mvpNotified.has(key)) {
        const top = await getTopGisPlayerForGame(gameId);
        const minGis = Number(process.env.PUSH_MVP_MIN_GIS) || 30;
        if (top && top.gis >= minGis) {
          mvpNotified.add(key);
          await broadcastToAll(
            '本场最佳表现',
            `${top.name}（${top.teamNameZhCN || top.teamAbbreviation}）Swish GIS ${top.gis.toFixed(1)}`,
            {
              type: 'mvp_performance',
              gameId: String(gameId),
              ...(top.playerId && { playerId: top.playerId }),
            }
          );
          console.log(`[Push] MVP GIS ${gameId} ${top.name}`);
        }
      }
    }
  }

  if (closeGameAlerted.size > 500) {
    for (const k of closeGameAlerted) {
      if (!k.startsWith(dateKey)) closeGameAlerted.delete(k);
    }
  }
  if (mvpNotified.size > 500) {
    for (const k of mvpNotified) {
      if (!k.startsWith(dateKey)) mvpNotified.delete(k);
    }
  }
}

module.exports = {
  registerToken,
  getTokenCount,
  runScheduledChecks,
};
