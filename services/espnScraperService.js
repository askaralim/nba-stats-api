/**
 * ESPN API Service
 * League player “boards” use the site **leaders** API; postseason probe also uses leaders.
 */

const { getTeamNameZhCn, getTeamCityZhCn } = require('../utils/teamTranslations');
const { formatPlayerNameForDisplay } = require('../utils/playerName');
const seasonDefaults = require('../config/seasonDefaults');
const seasonTypeCache = require('./seasonTypeCache');
const leagueSeasonService = require('./leagueSeasonService');
const logger = require('../utils/logger');

/** Cached result of “can we load playoff leaders?” probe (avoid hitting ESPN every request). */
const POSTSEASON_PROBE_TTL_MS = 30 * 60 * 1000;
let postseasonProbeCache = { value: /** @type {boolean | null} */ null, at: 0 };

/** Maps ESPN leaders `categories[].name` → `/nba/stats/players` `topPlayersByStat` keys (byathlete-era names). */
const PLAYER_LEADER_CATEGORY_MAP = [
  { statName: 'avgPoints', espnName: 'pointsPerGame', title: '场均得分', description: 'Points Per Game' },
  { statName: 'avgAssists', espnName: 'assistsPerGame', title: '场均助攻', description: 'Assists Per Game' },
  { statName: 'avgRebounds', espnName: 'reboundsPerGame', title: '场均篮板', description: 'Rebounds Per Game' },
  { statName: 'avgSteals', espnName: 'stealsPerGame', title: '场均抢断', description: 'Steals Per Game' },
  { statName: 'avgBlocks', espnName: 'blocksPerGame', title: '场均盖帽', description: 'Blocks Per Game' },
  { statName: 'doubleDouble', espnName: 'doubleDouble', title: '两双次数', description: 'Double Double' },
  { statName: 'tripleDouble', espnName: null, title: '三双次数', description: 'Triple Double' },
  {
    statName: 'avgThreePointFieldGoalsMade',
    espnName: '3PointsMadePerGame',
    title: '场均三分命中',
    description: 'Average 3-Point Field Goals Made',
  },
  { statName: 'fieldGoalPct', espnName: 'fieldGoalPercentage', title: '投篮命中率', description: 'Field Goal Percentage' },
  { statName: 'threePointFieldGoalPct', espnName: '3PointPct', title: '三分命中率', description: '3-Point Field Goal Percentage' },
];

const GAMES_PLAYED_PLACEHOLDER = {
  value: null,
  rank: null,
  displayValue: '-',
  label: 'GP',
  displayName: 'Games Played',
  description: '',
  category: 'leaders',
};

class ESPNScraperService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 3600000; // 1 hour cache
  }

  /**
   * One-off fetch: do playoff leaders (seasontype=3) return any rows? Does not use getLeaders cache.
   * @returns {Promise<boolean>}
   */
  async probePostseasonLeadersHasData() {
    const y = seasonDefaults.STANDINGS_YEAR;
    const attempts = [
      { season: null },
      { season: String(y) },
    ];
    for (const att of attempts) {
      const params = new URLSearchParams({
        region: 'us',
        lang: 'en',
        contentorigin: 'espn',
        limit: '1',
        qualified: 'true',
        seasontype: '3',
      });
      if (att.season) params.set('season', att.season);
      const url = `${seasonDefaults.LEADERS_API_URL}?${params.toString()}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (!response.ok) continue;
      const data = await response.json();
      seasonTypeCache.updateFromResponse(data);
      const categories = data.leaders?.categories || [];
      if (categories.some((cat) => (cat.leaders || []).length > 0)) return true;
    }
    return false;
  }

  /**
   * ESPN-only: playoffs toggle when cache says postseason AND leaders probe has rows.
   * Used when `league_seasons` has no current row (avoid DB read inside resolveSeasonMeta).
   * @returns {Promise<boolean>}
   */
  async _getPostseasonAvailableEspnOnly() {
    const current = seasonTypeCache.get();
    if (!current || current.type !== 3) {
      return false;
    }
    if (
      postseasonProbeCache.value !== null &&
      Date.now() - postseasonProbeCache.at < POSTSEASON_PROBE_TTL_MS
    ) {
      return postseasonProbeCache.value;
    }
    let ok = false;
    try {
      ok = await this.probePostseasonLeadersHasData();
    } catch {
      ok = false;
    }
    postseasonProbeCache = { value: ok, at: Date.now() };
    return ok;
  }

  /**
   * @param {number} requestedSeasonTypeForMeta - type id to expose as requested* (from leaders response or effective fetch)
   * @returns {Promise<object>} seasonMeta
   */
  async resolveSeasonMeta(requestedSeasonTypeForMeta) {
    const row = await leagueSeasonService.getCurrentSeasonRow();
    if (row) {
      return leagueSeasonService.seasonMetaFromRow(row, requestedSeasonTypeForMeta);
    }
    const postseasonAvailable = await this._getPostseasonAvailableEspnOnly();
    return seasonTypeCache.buildSeasonMeta(requestedSeasonTypeForMeta, postseasonAvailable);
  }

  /**
   * Parse season string to extract year and season type
   * @param {string} season - Season string (e.g., "2026|2" or "2026")
   * @returns {Object} { year, seasonType }
   */
  parseSeason(season) {
    if (!season) {
      const parts = seasonDefaults.ESPN_PLAYER_STATS_SEASON.split('|');
      return {
        year: parseInt(parts[0], 10) || seasonDefaults.STANDINGS_YEAR,
        seasonType: parts[1] ? parseInt(parts[1], 10) : seasonDefaults.STANDINGS_TYPE
      };
    }

    const parts = season.split('|');
    const year = parseInt(parts[0], 10) || seasonDefaults.STANDINGS_YEAR;
    const seasonType = parts[1] ? parseInt(parts[1], 10) : seasonDefaults.STANDINGS_TYPE;

    return { year, seasonType };
  }

  leadersFetchHeaders() {
    return {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
    };
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * One GET to ESPN site leaders. Omit `season` / `seasontype` when null so ESPN uses the current segment.
   * @returns {Promise<{ ok: boolean, status: number, data: object | null }>}
   */
  async fetchLeadersOnce({ limit, seasonYear, seasontype }) {
    const params = new URLSearchParams({
      region: 'us',
      lang: 'en',
      contentorigin: 'espn',
      qualified: 'true',
      limit: String(limit),
    });
    if (seasonYear != null) params.set('season', String(seasonYear));
    if (seasontype != null) params.set('seasontype', String(seasontype));
    const url = `${seasonDefaults.LEADERS_API_URL}?${params.toString()}`;
    try {
      const response = await fetch(url, { headers: this.leadersFetchHeaders() });
      if (!response.ok) {
        return { ok: false, status: response.status, data: null };
      }
      const data = await response.json();
      return { ok: true, status: response.status, data };
    } catch {
      return { ok: false, status: 0, data: null };
    }
  }

  /**
   * Query variants: ESPN often 404s when both `season` and `seasontype` are pinned after a segment ends.
   * @param {number|undefined} seasontype - 2 regular, 3 postseason, undefined = calendar auto
   * @param {number} seasonYear - ending year from client season param (e.g. 2026)
   * @returns {Array<{ seasonYear: number|null, seasontype: number|null }>}
   */
  buildLeadersParamAttempts(seasontype, seasonYear) {
    const y = seasonYear || seasonDefaults.STANDINGS_YEAR;
    if (seasontype === 3) {
      return [
        { seasonYear: null, seasontype: 3 },
        { seasonYear: y, seasontype: 3 },
      ];
    }
    if (seasontype === 2) {
      return [
        { seasonYear: null, seasontype: 2 },
        { seasonYear: null, seasontype: null },
        { seasonYear: y, seasontype: null },
        { seasonYear: y, seasontype: 2 },
      ];
    }
    return [
      { seasonYear: null, seasontype: null },
      { seasonYear: y, seasontype: null },
    ];
  }

  seasonTypeIdFromLeadersData(data) {
    const requestedType = data?.requestedSeason?.type;
    if (requestedType && typeof requestedType === 'object') {
      return Number(requestedType.type || requestedType.id || 2);
    }
    const n = Number(requestedType ?? 2);
    return Number.isFinite(n) ? n : 2;
  }

  /**
   * @param {object} data - ESPN leaders JSON
   * @param {number} topN - max rows per category (UI shows 9)
   */
  buildTopPlayersByStatFromLeadersData(data, topN) {
    const categories = data.leaders?.categories || [];
    const byName = new Map(categories.map((c) => [c.name, c]));
    const out = {};

    for (const def of PLAYER_LEADER_CATEGORY_MAP) {
      if (!def.espnName) {
        out[def.statName] = { title: def.title, description: def.description, players: [] };
        continue;
      }
      const cat = byName.get(def.espnName);
      const rows = (cat?.leaders || []).slice(0, topN);
      const players = rows.map((leader, i) => {
        const athlete = leader.athlete || {};
        const team = leader.team || {};
        const displayValue =
          leader.displayValue != null && leader.displayValue !== ''
            ? leader.displayValue
            : leader.value != null
              ? String(leader.value)
              : '-';
        const rank = i + 1;
        return {
          id: String(athlete.id ?? ''),
          name: formatPlayerNameForDisplay(athlete.displayName || athlete.fullName || ''),
          headshot: athlete.headshot?.href || null,
          team: team.name || '',
          teamNameZhCN: getTeamNameZhCn(team.name || ''),
          teamCityZhCN: getTeamCityZhCn(team.name || ''),
          teamLogo: team.logos?.[0]?.href || null,
          position: athlete.position?.abbreviation || athlete.position?.name || '',
          statRank: rank,
          stats: {
            [def.statName]: {
              value: leader.value,
              rank,
              displayValue,
              label: '',
              displayName: '',
              description: '',
              category: 'leaders',
            },
            gamesPlayed: { ...GAMES_PLAYED_PLACEHOLDER },
          },
        };
      });
      out[def.statName] = {
        title: def.title,
        description: def.description,
        players,
      };
    }
    return out;
  }

  buildEmptyTopPlayersByStat() {
    const out = {};
    for (const def of PLAYER_LEADER_CATEGORY_MAP) {
      out[def.statName] = {
        title: def.title,
        description: def.description,
        players: [],
      };
    }
    return out;
  }

  async fetchLeadersJsonResilient(paramAttempts, limit) {
    let lastStatus = 0;
    const maxRetriesPerAttempt = 2;
    for (const att of paramAttempts) {
      for (let retry = 0; retry <= maxRetriesPerAttempt; retry += 1) {
        const result = await this.fetchLeadersOnce({
          limit,
          seasonYear: att.seasonYear,
          seasontype: att.seasontype,
        });
        if (result.ok && result.data) {
          return result.data;
        }
        lastStatus = result.status;
        const retryable =
          result.status === 0 ||
          result.status === 404 ||
          result.status === 408 ||
          result.status === 429 ||
          result.status === 500 ||
          result.status === 502 ||
          result.status === 503 ||
          result.status === 504;

        if (!retryable) {
          throw new Error(`ESPN Leaders API error: ${result.status}`);
        }

        if (retry < maxRetriesPerAttempt) {
          const backoffMs = 250 * (2 ** retry);
          await this.sleep(backoffMs);
        }
      }
    }
    throw new Error(`ESPN Leaders API error: ${lastStatus || 'unknown'} (no param fallback succeeded)`);
  }

  /**
   * Player “list” stats for `/nba/stats/players`: built from ESPN **site** leaders (not byathlete).
   * @param {Object} options - Query options
   * @param {string} options.season - Season (e.g., "2026|2" or "2026|3")
   * @param {string} options.position - Kept for API compatibility; leaders feed is not position-filtered here
   * @param {string} options.conference - Unused
   * @param {number} options.page - Kept for cache key only
   * @param {number} options.limit - Leaders `limit` per category (clamped 9–100)
   * @param {string} options.sort - Unused (leaders are per category)
   * @returns {Promise<Object>} Same shape as legacy byathlete response
   */
  async getPlayerStats(options = {}) {
    const {
      season = seasonDefaults.ESPN_PLAYER_STATS_SEASON,
      position = 'all-positions',
      page = 1,
      limit = 50,
      sort = 'offensive.avgPoints:desc',
    } = options;

    const { year, seasonType: requestedSeasonType } = this.parseSeason(season);
    const leadersLimit = Math.min(100, Math.max(9, Number(limit) || 20));
    const topN = 9;

    const cacheKey = `espn_stats_leaders_${year}_${requestedSeasonType}_${position || 'all'}_${page}_${leadersLimit}_${sort}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      const payload = cached.data;
      const id = payload?.metadata?.seasonTypeId;
      const typeForMeta = Number.isFinite(id) ? id : requestedSeasonType;
      const seasonMeta = await this.resolveSeasonMeta(typeForMeta);
      return { ...payload, seasonMeta };
    }

    try {
      const paramAttempts = this.buildLeadersParamAttempts(requestedSeasonType, year);
      const data = await this.fetchLeadersJsonResilient(paramAttempts, leadersLimit);
      seasonTypeCache.updateFromResponse(data);

      const effectiveSeasonType = this.seasonTypeIdFromLeadersData(data);
      const topPlayersByStat = this.buildTopPlayersByStatFromLeadersData(data, topN);
      const seasonMeta = await this.resolveSeasonMeta(effectiveSeasonType);

      const categories = data.leaders?.categories || [];
      const maxLeaders = categories.reduce(
        (m, c) => Math.max(m, (c.leaders || []).length),
        0,
      );

      const transformedData = {
        metadata: {
          season: `${year}-${year + 1}`,
          seasonType: effectiveSeasonType === 3 ? 'Postseason' : 'Regular Season',
          seasonTypeId: effectiveSeasonType,
          position: position === 'all-positions' ? 'All Positions' : position,
          totalCount: maxLeaders,
        },
        topPlayersByStat,
        seasonMeta,
      };

      this.cache.set(cacheKey, {
        data: transformedData,
        timestamp: Date.now(),
      });

      return transformedData;
    } catch (error) {
      logger.error({ component: 'espnScraper', task: 'leaders', err: error }, 'Error fetching ESPN player stats (leaders)');
      const isLeadersFetchError =
        error &&
        typeof error.message === 'string' &&
        error.message.startsWith('ESPN Leaders API error:');

      if (!isLeadersFetchError) {
        throw error;
      }

      const fallbackTopPlayersByStat = this.buildEmptyTopPlayersByStat();
      const fallbackSeasonMeta = await this.resolveSeasonMeta(requestedSeasonType);
      const fallbackData = {
        metadata: {
          season: `${year}-${year + 1}`,
          seasonType: requestedSeasonType === 3 ? 'Postseason' : 'Regular Season',
          seasonTypeId: requestedSeasonType,
          position: position === 'all-positions' ? 'All Positions' : position,
          totalCount: 0,
        },
        topPlayersByStat: fallbackTopPlayersByStat,
        seasonMeta: fallbackSeasonMeta,
      };

      // Short cache to reduce repeated upstream failures during ESPN outages.
      this.cache.set(cacheKey, {
        data: fallbackData,
        timestamp: Date.now(),
      });

      return fallbackData;
    }
  }

  /**
   * Fetch season leaders from ESPN Leaders API.
   * This API is purpose-built for top players by category and auto-detects the current season.
   *
   * @param {Object} options
   * @param {number} [options.seasontype] - Optional season type (2=Regular, 3=Postseason). Omit for ESPN auto-detect.
   * @param {number} [options.limit=5] - Number of leaders per category
   * @returns {Promise<Object>} { points, rebounds, assists, seasonMeta }
   */
  async getLeaders(options = {}) {
    const { seasontype, limit = 5 } = options;

    const cacheKey = `espn_leaders_${seasontype || 'auto'}_${limit}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      const payload = cached.data;
      const rt = payload?.seasonMeta?.requestedSeasonType;
      const typeForMeta = Number.isFinite(rt) ? rt : seasontype ?? 2;
      const seasonMeta = await this.resolveSeasonMeta(typeForMeta);
      return { ...payload, seasonMeta };
    }

    try {
      const paramAttempts = this.buildLeadersParamAttempts(seasontype, seasonDefaults.STANDINGS_YEAR);
      const data = await this.fetchLeadersJsonResilient(paramAttempts, limit);
      seasonTypeCache.updateFromResponse(data);

      // Parse categories from the leaders response
      const categories = data.leaders?.categories || [];
      const transformedLeaders = {};

      // Map ESPN category names to our internal names
      const categoryMap = {
        'pointsPerGame': 'points',
        'assistsPerGame': 'assists',
        'reboundsPerGame': 'rebounds',
        'fieldGoalPercentage': 'fieldGoalPct'
      };

      categories.forEach(category => {
        const internalName = categoryMap[category.name];
        if (!internalName) return; // Skip categories we don't use

        const leaders = (category.leaders || []).map(leader => {
          const athlete = leader.athlete || {};
          const team = leader.team || {};

          return {
            id: athlete.id || null,
            name: formatPlayerNameForDisplay(athlete.displayName || athlete.fullName || ''),
            team: team.name || '',
            teamNameZhCN: getTeamNameZhCn(team.name || ''),
            teamAbbreviation: team.abbreviation || null,
            headshot: athlete.headshot?.href || null,
            value: leader.displayValue || String(leader.value) || '-',
            statType: category.abbreviation || category.name
          };
        });

        transformedLeaders[internalName] = leaders;
      });

      const requestedSeasonType = this.seasonTypeIdFromLeadersData(data);

      const seasonMeta = await this.resolveSeasonMeta(requestedSeasonType);

      const result = {
        ...transformedLeaders,
        seasonMeta
      };

      // Cache the response
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });

      return result;
    } catch (error) {
      logger.error({ component: 'espnScraper', task: 'leaders', err: error }, 'Error fetching ESPN leaders');
      throw error;
    }
  }

}

module.exports = new ESPNScraperService();
