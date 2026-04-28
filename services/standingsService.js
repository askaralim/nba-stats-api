/**
 * ESPN Standings Service
 * Fetches team standings from ESPN API
 */

const { getTeamNameZhCn, getTeamCityZhCn } = require('../utils/teamTranslations');
const seasonDefaults = require('../config/seasonDefaults');
const { fetchWithRetry } = require('../utils/retry');
const logger = require('../utils/logger');
const db = require('../config/db');
const standingsRepository = require('../repositories/standingsRepository');

/** Postgres standings snapshot TTL (shorter than team basics — standings change nightly). */
const STANDINGS_DB_CACHE_TTL_MS = 30 * 60 * 1000;

class StandingsService {
  constructor() {
    this.baseUrl = 'https://site.web.api.espn.com/apis/v2/sports/basketball/nba/standings';
    this.cache = new Map();
    this.cacheTimeout = 3600000; // 1 hour cache
  }

  /**
   * Extract stat value by name
   * @param {Array} stats - Stats array
   * @param {string} statName - Stat name to find
   * @returns {number|null} Stat value or null
   */
  getStatValue(stats, statName) {
    const stat = stats.find(s => s.name === statName);
    return stat ? stat.value : null;
  }

  /**
   * Format win percentage as string (e.g., "80.8%")
   * @param {number|null} percent - Win percentage (0-1)
   * @returns {string} Formatted percentage or '-'
   */
  formatWinPercent(percent) {
    if (percent === null || percent === undefined) return '-';
    return `${(percent * 100).toFixed(1)}%`;
  }

  /**
   * Format games behind as string
   * @param {number|null} gamesBehind - Games behind
   * @returns {string} Formatted games behind or '-'
   */
  formatGamesBehind(gamesBehind) {
    if (gamesBehind === null || gamesBehind === undefined || gamesBehind === 0) return '-';
    return gamesBehind.toFixed(1);
  }

  /**
   * Transform team entry to our format
   * @param {Object} entry - ESPN API entry object
   * @returns {Object} Transformed team data
   */
  transformTeamEntry(entry) {
    const team = entry.team;
    const stats = entry.stats || [];

    const wins = this.getStatValue(stats, 'wins');
    const losses = this.getStatValue(stats, 'losses');
    const winPercent = this.getStatValue(stats, 'winPercent');
    const gamesBehind = this.getStatValue(stats, 'gamesBehind');
    const streakType = stats.find(s => s.name === 'streak')?.displayValue || null;

    // Extract team name and city from displayName (e.g., "Los Angeles Lakers" -> city: "Los Angeles", name: "Lakers")
    const displayName = team.displayName || '';
    const parts = displayName.split(' ');
    const city = parts.slice(0, -1).join(' ') || team.location || '';
    const name = parts[parts.length - 1] || displayName;

    return {
      id: team.id,
      uid: team.uid,
      name: name,
      nameZhCN: getTeamNameZhCn(name), // Chinese team name (Simplified Chinese, zh-CN)
      city: city,
      cityZhCN: getTeamCityZhCn(city), // Chinese city name (Simplified Chinese, zh-CN)
      shortName: team.shortDisplayName,
      abbreviation: team.abbreviation,
      location: team.location,
      logo: team.logos?.[0]?.href || null,
      wins: wins,
      losses: losses,
      winPercent: winPercent, // Keep raw value for sorting/filtering
      winPercentDisplay: this.formatWinPercent(winPercent), // Formatted for display
      playoffSeed: this.getStatValue(stats, 'playoffSeed'),
      gamesBehind: gamesBehind, // Keep raw value
      gamesBehindDisplay: this.formatGamesBehind(gamesBehind), // Formatted for display
      homeWins: this.getStatValue(stats, 'homeWins'),
      homeLosses: this.getStatValue(stats, 'homeLosses'),
      awayWins: this.getStatValue(stats, 'awayWins'),
      awayLosses: this.getStatValue(stats, 'awayLosses'),
      streak: this.getStatValue(stats, 'streak'),
      streakType: streakType
    };
  }

  /**
   * Build persistence rows from API-shaped standings (after ESPN transform).
   * @param {object} transformedData
   * @returns {object[]}
   */
  buildEntriesForInsert(transformedData) {
    const { season, seasonType, conferences } = transformedData;
    const out = [];
    for (const [conferenceKey, conf] of Object.entries(conferences)) {
      conf.teams.forEach((team, index) => {
        out.push({
          season_year: season,
          season_type: seasonType,
          espn_team_id: String(team.id),
          conference_key: conferenceKey,
          conference_id: conf.id != null ? String(conf.id) : null,
          conference_name: conf.name ?? null,
          conference_abbreviation: conf.abbreviation ?? null,
          sort_order: index + 1,
          wins: team.wins,
          losses: team.losses,
          win_percent: team.winPercent,
          games_behind: team.gamesBehind,
          playoff_seed: team.playoffSeed,
          home_wins: team.homeWins,
          home_losses: team.homeLosses,
          away_wins: team.awayWins,
          away_losses: team.awayLosses,
          streak: team.streak,
          streak_display: team.streakType,
          espn_team_uid: team.uid != null ? String(team.uid) : null,
          short_display_name: team.shortName ?? null,
          team_location: team.location ?? null,
          team_name: team.name,
          team_city: team.city,
          team_abbreviation: team.abbreviation,
          logo_url: team.logo,
        });
      });
    }
    return out;
  }

  /**
   * @param {import('pg').QueryResultRow} row
   * @returns {object}
   */
  mapDbRowToTeam(row) {
    const idRaw = String(row.espn_team_id);
    const id = /^\d+$/.test(idRaw) ? parseInt(idRaw, 10) : idRaw;
    const wp = row.win_percent != null ? Number(row.win_percent) : null;
    const gb = row.games_behind != null ? Number(row.games_behind) : null;

    return {
      id,
      uid: row.espn_team_uid,
      name: row.team_name,
      nameZhCN: getTeamNameZhCn(row.team_name),
      city: row.team_city,
      cityZhCN: getTeamCityZhCn(row.team_city),
      shortName: row.short_display_name,
      abbreviation: row.team_abbreviation,
      location: row.team_location,
      logo: row.logo_url,
      wins: row.wins,
      losses: row.losses,
      winPercent: wp,
      winPercentDisplay: this.formatWinPercent(wp),
      playoffSeed: row.playoff_seed,
      gamesBehind: gb,
      gamesBehindDisplay: this.formatGamesBehind(gb),
      homeWins: row.home_wins,
      homeLosses: row.home_losses,
      awayWins: row.away_wins,
      awayLosses: row.away_losses,
      streak: row.streak,
      streakType: row.streak_display,
    };
  }

  /**
   * @param {import('pg').QueryResultRow} meta
   * @param {import('pg').QueryResultRow[]} rows
   */
  buildFromDbRows(meta, rows, season, seasonType) {
    const conferences = {};
    for (const row of rows) {
      const key = row.conference_key;
      if (!conferences[key]) {
        conferences[key] = {
          id: row.conference_id,
          name: row.conference_name,
          abbreviation: row.conference_abbreviation,
          season,
          seasonType,
          seasonDisplayName:
            meta.season_display_name || `${season - 1}-${season}`,
          teams: [],
        };
      }
      conferences[key].teams.push(this.mapDbRowToTeam(row));
    }

    return {
      season,
      seasonType,
      seasonDisplayName: meta.season_display_name || `${season - 1}-${season}`,
      conferences,
    };
  }

  /**
   * Load standings from Postgres if snapshot exists and is fresh enough.
   * @returns {Promise<object|null>}
   */
  async tryGetStandingsFromDb(season, seasonType) {
    if (!db.isConfigured) return null;

    const meta = await standingsRepository.getMeta(season, seasonType);
    if (!meta) return null;

    const age = Date.now() - new Date(meta.fetched_at).getTime();
    if (age >= STANDINGS_DB_CACHE_TTL_MS) return null;

    const rows = await standingsRepository.listEntries(season, seasonType);
    if (!rows.length) return null;

    const minTeams = seasonType === 2 ? 28 : 4;
    if (rows.length < minTeams) return null;

    return this.buildFromDbRows(meta, rows, season, seasonType);
  }

  async persistStandingsSnapshot(transformedData) {
    try {
      await standingsRepository.replaceSnapshot({
        seasonYear: transformedData.season,
        seasonType: transformedData.seasonType,
        seasonDisplayName: transformedData.seasonDisplayName,
        entries: this.buildEntriesForInsert(transformedData),
      });
    } catch (err) {
      logger.warn(
        { component: 'standingsService', task: 'persistSnapshot', errorMessage: err.message },
        'Failed to persist standings snapshot'
      );
    }
  }

  /**
   * Fetch NBA standings
   * @param {Object} options - Query options
   * @param {number} options.season - Season year (default: 2026)
   * @param {number} options.seasonType - Season type (2=Regular, 3=Playoffs, default: 2)
   * @returns {Promise<Object>} Standings data organized by conference
   */
  async getStandings(options = {}) {
    const {
      season = seasonDefaults.STANDINGS_YEAR,
      seasonType = seasonDefaults.STANDINGS_TYPE
    } = options;

    const cacheKey = `standings_${season}_${seasonType}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    const fromDb = await this.tryGetStandingsFromDb(season, seasonType);
    if (fromDb) {
      this.cache.set(cacheKey, {
        data: fromDb,
        timestamp: Date.now(),
      });
      return fromDb;
    }

    try {
      const params = new URLSearchParams({
        region: 'us',
        lang: 'en',
        contentorigin: 'espn',
        type: '0',
        level: '2',
        sort: 'playoffseed:asc'
      });

      const url = `${this.baseUrl}?${params.toString()}`;

      const response = await fetchWithRetry(
        url,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'application/json',
            'Accept-Language': 'en-US,en;q=0.9'
          },
          timeout: 30000
        },
        { maxRetries: 2, initialDelay: 800, maxDelay: 4000 }
      );

      if (!response.ok) {
        throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Transform the response
      const conferences = {};
      let seasonDisplayName = null;
      
      (data.children || []).forEach(conference => {
        if (!conference.isConference) return;

        const conferenceName = conference.abbreviation || conference.name;
        const entries = conference.standings?.entries || [];
        
        // Get seasonDisplayName from first conference (they should all be the same)
        if (!seasonDisplayName && conference.standings?.seasonDisplayName) {
          seasonDisplayName = conference.standings.seasonDisplayName;
        }

        conferences[conferenceName] = {
          id: conference.id,
          name: conference.name,
          abbreviation: conference.abbreviation,
          season: conference.standings?.season || season,
          seasonType: conference.standings?.seasonType || seasonType,
          seasonDisplayName: conference.standings?.seasonDisplayName || `${season - 1}-${season}`,
          teams: entries.map(entry => this.transformTeamEntry(entry))
        };
      });

      // Use first conference's seasonDisplayName or generate one
      if (!seasonDisplayName) {
        seasonDisplayName = `${season - 1}-${season}`;
      }

      const transformedData = {
        season: season,
        seasonType: seasonType,
        seasonDisplayName: seasonDisplayName,
        conferences: conferences
      };

      await this.persistStandingsSnapshot(transformedData);

      // Cache the response
      this.cache.set(cacheKey, {
        data: transformedData,
        timestamp: Date.now()
      });

      return transformedData;
    } catch (error) {
      logger.error({ component: 'standingsService', err: error }, 'Error fetching standings');
      throw error;
    }
  }
}

module.exports = new StandingsService();

