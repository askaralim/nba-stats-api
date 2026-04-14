/**
 * NBA Service (ESPN API)
 * Fetches game data from ESPN API endpoints
 */

const gameTransformer = require('../utils/gameTransformer');
const { fetchWithRetry } = require('../utils/retry');
const { getTeamNameZhCn } = require('../utils/teamTranslations');
const { formatPlayerNameForDisplay } = require('../utils/playerName');
const seasonTypeCache = require('./seasonTypeCache');

class NBAService {
  constructor() {
    this.baseUrl = 'https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba';
    this.cache = new Map();
    this.cacheTimeout = 5000; // 5 seconds cache for live games
  }

  /**
   * Map ESPN status to internal status code
   * @param {string} espnStatus - ESPN status name
   * @returns {number} Status code (1=Scheduled, 2=Live, 3=Final)
   */
  mapStatus(espnStatus) {
    const statusMap = {
      'STATUS_SCHEDULED': 1,
      'STATUS_IN_PROGRESS': 2,
      'STATUS_FINAL': 3,
      'STATUS_DELAYED': 1,
      'STATUS_POSTPONED': 1,
      'STATUS_SUSPENDED': 2
    };
    return statusMap[espnStatus] || 1;
  }

  /**
   * Format date to ESPN API format (YYYYMMDD)
   * @param {Date|string} date - Date object, ISO date string (YYYY-MM-DD), or YYYYMMDD string
   * @returns {string} Formatted date string (YYYYMMDD)
   */
  formatDateForAPI(date) {
    if (!date) {
      date = new Date();
    }
    
    // If it's already in YYYYMMDD format (8 digits), return as-is
    if (typeof date === 'string' && /^\d{8}$/.test(date)) {
      return date;
    }
    
    // Parse the date
    if (typeof date === 'string') {
      date = new Date(date);
    }
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Fetch scoreboard for a specific date
   * @param {Date|string} date - Optional date (defaults to today)
   * @returns {Promise<Object>} Raw ESPN scoreboard data
   */
  async getScoreboard(date = null) {
    const dateStr = date ? (typeof date === 'string' ? date : date.toISOString().split('T')[0]) : new Date().toISOString().split('T')[0];
    const espnDate = this.formatDateForAPI(dateStr);
    const cacheKey = `scoreboard_${espnDate}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const url = `${this.baseUrl}/scoreboard?dates=${espnDate}`;

      // Use retry logic with exponential backoff for transient failures
      const response = await fetchWithRetry(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'application/json'
        },
        timeout: 30000 // 30 seconds
      }, {
        maxRetries: 2, // Retry up to 2 times (3 total attempts)
        initialDelay: 1000,
        maxDelay: 5000
      });
      
      if (!response.ok) {
        throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Update season type cache from scoreboard response
      seasonTypeCache.updateFromResponse(data);

      // Cache the response
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      return data;
    } catch (error) {
      // If all retries failed and we have cached data, return it
      if (cached && (error.name === 'AbortError' || error.code === 'UND_ERR_CONNECT_TIMEOUT' || error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT')) {
        console.warn(`Scoreboard fetch failed for ${espnDate} after retries, returning cached data`);
        return cached.data;
      }
      
      console.error('Error fetching scoreboard:', error);
      throw error;
    }
  }

  /**
   * Fetch today's scoreboard (backward compatibility)
   * @returns {Promise<Object>} Raw ESPN scoreboard data
   */
  async getTodaysScoreboard() {
    return this.getScoreboard();
  }

  /**
   * Fetch game details by game ID (header + full summary in one call).
   * Built on getGameSummary; returns normalized { event, summaryData } so callers
   * get event (header) and full summary without a second request.
   * @param {string} gameId - Game ID
   * @returns {Promise<{ event: Object, summaryData: Object }>} event = summaryData.header, summaryData = full ESPN summary
   */
  async getGameDetails(gameId) {
    const cacheKey = `game_${gameId}`;
    const cached = this.cache.get(cacheKey);

    // Cache: 2 min to reduce ESPN API load
    if (cached && Date.now() - cached.timestamp < 2 * 60 * 1000) {
      return cached.data;
    }

    try {
      const summaryData = await this.getGameSummary(gameId);
      if (!summaryData || !summaryData.header) {
        throw new Error(`Game ${gameId} not found in summary data`);
      }
      // header is the event object (id, date, competitions, etc.) from summary API
      const event = summaryData.header;
      if (!event?.competitions?.[0]) {
        throw new Error(`Game ${gameId} has no competition data in summary`);
      }

      // Cache the game
      this.cache.set(cacheKey, {
        data: { event, summaryData },
        timestamp: Date.now()
      });

      return { event, summaryData };
    } catch (error) {
      // If all retries failed and we have cached data (even if expired), return it
      const isTimeoutError = error.name === 'AbortError' || 
                             error.code === 'UND_ERR_CONNECT_TIMEOUT' || 
                             error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
                             error.message?.includes('timeout');
      
      if (isTimeoutError && cached) {
        console.warn(`Game details fetch failed for ${gameId} after retries, returning cached data (age: ${Math.round((Date.now() - cached.timestamp) / 1000)}s)`);
        return cached.data;
      }
      
      console.error('Error fetching game details:', error);
      throw error;
    }
  }

  /**
   * Fetch raw game summary from ESPN (header, boxscore, etc.).
   * Use getGameDetails when you need both event (header) and summary in one call.
   * @param {string} gameId - Game ID
   * @returns {Promise<Object>} Raw ESPN summary (header, boxscore, seasonseries, injuries, ...)
   */
  async getGameSummary(gameId) {
    const cacheKey = `summary_${gameId}`;
    const cached = this.cache.get(cacheKey);

    // Cache: 2 min to reduce ESPN API load
    if (cached && Date.now() - cached.timestamp < 2 * 60 * 1000) {
      return cached.data;
    }

    try {
      const url = `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?region=us&lang=en&contentorigin=espn&event=${gameId}`;
      
      // Use retry logic with exponential backoff for transient failures
      const response = await fetchWithRetry(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'application/json'
        },
        timeout: 30000 // 30 seconds
      }, {
        maxRetries: 2, // Retry up to 2 times (3 total attempts)
        initialDelay: 1000,
        maxDelay: 5000
      });
      
      if (!response.ok) {
        throw new Error(`ESPN Summary API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Cache the response
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      return data;
    } catch (error) {
      // If all retries failed and we have cached data, return it
      if (cached && (error.name === 'AbortError' || error.code === 'UND_ERR_CONNECT_TIMEOUT' || error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT')) {
        console.warn(`Game summary fetch failed for ${gameId} after retries, returning cached data`);
        return cached.data;
      }
      
      console.error('Error fetching game summary:', error);
      throw error;
    }
  }

  /**
   * Check if an ESPN event has started (in progress or finished)
   * @param {Object} event - Raw ESPN event
   * @returns {number|null} gameStatus 2 or 3 if started, null if scheduled
   */
  _getEventGameStatus(event) {
    const competition = event?.competitions?.[0];
    if (!competition) return null;
    const status = competition.status || {};
    const statusType = status.type || {};
    const statusName = statusType.name || '';

    const homeCompetitor = competition.competitors?.find(c => c.homeAway === 'home');
    const awayCompetitor = competition.competitors?.find(c => c.homeAway === 'away');
    const homeScore = homeCompetitor?.score !== undefined && homeCompetitor?.score !== null
      ? parseInt(homeCompetitor.score, 10) : null;
    const awayScore = awayCompetitor?.score !== undefined && awayCompetitor?.score !== null
      ? parseInt(awayCompetitor.score, 10) : null;
    const hasActualScores = homeScore !== null && awayScore !== null && (homeScore > 0 || awayScore > 0);
    const isCompleted = statusType.completed === true || status.completed === true;

    let gameStatus = this.mapStatus(statusName);
    if (hasActualScores && gameStatus === 1) {
      gameStatus = isCompleted ? 3 : 2;
    }
    if (hasActualScores && !isCompleted && gameStatus === 3) gameStatus = 2;
    if (hasActualScores && isCompleted && gameStatus === 2) gameStatus = 3;
    if (homeScore === 0 && awayScore === 0) {
      gameStatus = this.mapStatus(statusName);
    }

    return (gameStatus === 2 || gameStatus === 3) ? gameStatus : null;
  }

  /**
   * Get today's top performers by GIS (from game summary/boxscore)
   * Fetches game details for each started game, computes GIS, returns top 3-5
   * @param {string} date - Date in YYYYMMDD format
   * @returns {Promise<Object>} { mode, performers, hasFinishedGames }
   */
  async getTodayTopPerformersByGIS(date = null) {
    const dateStr = date || this.formatDateForAPI(new Date());
    const cacheKey = `today_top_gis_${dateStr}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 300000) {
      return cached.data;
    }

    try {
      const scoreboardData = await this.getScoreboard(dateStr);
      const events = scoreboardData.events || [];

      if (events.length === 0) {
        const emptyResult = {
          mode: 'gis',
          performers: [],
          hasFinishedGames: false
        };
        this.cache.set(cacheKey, { data: emptyResult, timestamp: Date.now() });
        return emptyResult;
      }

      const allPlayers = [];
      let hasFinishedGames = false;

      for (const event of events) {
        const gameStatus = this._getEventGameStatus(event);
        if (!gameStatus) continue;

        if (gameStatus === 3) hasFinishedGames = true;

        const gameId = event.id;
        let boxscore;
        try {
          const { summaryData } = await this.getGameDetails(gameId);
          if (!summaryData?.boxscore) continue;
          boxscore = gameTransformer.transformBoxscore(summaryData.boxscore);
        } catch (err) {
          console.warn(`Failed to get game details for ${gameId}:`, err.message);
          continue;
        }

        if (!boxscore?.teams) continue;

        for (const team of boxscore.teams) {
          const starters = team.starters || [];
          const bench = team.bench || [];
          const teamPlayers = [...starters, ...bench].filter(p => !p.didNotPlay);

          for (const player of teamPlayers) {
            if (player.gis == null) continue;
            allPlayers.push({
              id: player.athleteId,
              name: formatPlayerNameForDisplay(player.name || player.shortName || ''),
              teamAbbreviation: team.abbreviation || '',
              teamNameZhCN: getTeamNameZhCn(team.name),
              competitionId: gameId,
              headshot: player.headshot || null,
              gis: player.gis,
              stats: {
                points: parseInt(player.stats?.points) || 0,
                rebounds: parseInt(player.stats?.rebounds) || 0,
                assists: parseInt(player.stats?.assists) || 0,
                steals: parseInt(player.stats?.steals) || 0,
                blocks: parseInt(player.stats?.blocks) || 0,
                turnovers: parseInt(player.stats?.turnovers) || 0,
                fieldGoals: player.stats?.fieldGoals || '0-0',
                threePointers: player.stats?.threePointers || '0-0',
                freeThrows: player.stats?.freeThrows || '0-0'
              }
            });
          }
        }
      }

      const topPerformers = allPlayers
        .sort((a, b) => (b.gis || 0) - (a.gis || 0))
        .slice(0, 5);

      const result = {
        mode: 'gis',
        performers: topPerformers,
        hasFinishedGames
      };

      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch (error) {
      console.error('Error fetching today top performers by GIS:', error);
      return {
        mode: 'gis',
        performers: [],
        hasFinishedGames: false
      };
    }
  }

  /**
   * Get today's top performers from completed games (legacy - scoreboard leaders)
   * @param {string} date - Date in YYYYMMDD format
   * @returns {Promise<Object>} Top performers for today (points, rebounds, assists)
   */
  async getTodayTopPerformers(date = null) {
    const dateStr = date || this.formatDateForAPI(new Date());
    const cacheKey = `today_top_${dateStr}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 300000) {
      return cached.data;
    }

    try {
      const scoreboardData = await this.getScoreboard(dateStr);
      const events = scoreboardData.events || [];

      if (events.length === 0) {
        const emptyResult = { points: [], rebounds: [], assists: [] };
        this.cache.set(cacheKey, { data: emptyResult, timestamp: Date.now() });
        return emptyResult;
      }

      const allPlayers = new Map();

      events.forEach(event => {
        const competitionId = event.id;
        const competition = event.competitions?.[0];
        if (!competition?.competitors) return;

        competition.competitors.forEach(competitor => {
          const teamName = competitor.team?.displayName || competitor.team?.name || '';
          const teamAbbreviation = competitor.team?.abbreviation || '';

          const statCategories = competitor.leaders || [];
          statCategories.forEach(category => {
            const categoryName = category.name?.toLowerCase();
            if (!categoryName || !category.leaders || !Array.isArray(category.leaders)) return;

            category.leaders.forEach(leader => {
              const athlete = leader.athlete;
              if (!athlete?.id) return;

              const statValue = parseInt(leader.displayValue || leader.value || 0);

              const playerId = athlete.id;
              if (allPlayers.has(playerId)) {
                const existing = allPlayers.get(playerId);
                if (categoryName === 'points') existing.points = Math.max(existing.points, statValue);
                else if (categoryName === 'rebounds') existing.rebounds = Math.max(existing.rebounds, statValue);
                else if (categoryName === 'assists') existing.assists = Math.max(existing.assists, statValue);
              } else {
                const player = {
                  id: playerId,
                  name: formatPlayerNameForDisplay(athlete.fullName || athlete.displayName || athlete.shortName || ''),
                  team: teamName,
                  teamNameZhCN: getTeamNameZhCn(competitor.team.name),
                  teamAbbreviation: teamAbbreviation,
                  competitionId: competitionId,
                  headshot: athlete.headshot?.href || athlete.headshot || null,
                  points: 0,
                  rebounds: 0,
                  assists: 0
                };
                if (categoryName === 'points') player.points = statValue;
                else if (categoryName === 'rebounds') player.rebounds = statValue;
                else if (categoryName === 'assists') player.assists = statValue;
                allPlayers.set(playerId, player);
              }
            });
          });
        });
      });

      const playersArray = Array.from(allPlayers.values());
      const topPoints = [...playersArray].filter(p => p.points > 0).sort((a, b) => b.points - a.points).slice(0, 3);
      const topRebounds = [...playersArray].filter(p => p.rebounds > 0).sort((a, b) => b.rebounds - a.rebounds).slice(0, 3);
      const topAssists = [...playersArray].filter(p => p.assists > 0).sort((a, b) => b.assists - a.assists).slice(0, 3);

      const toPlayerShape = (p, valueKey) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        teamNameZhCN: p.teamNameZhCN,
        teamAbbreviation: p.teamAbbreviation,
        competitionId: p.competitionId,
        headshot: p.headshot,
        value: p[valueKey]
      });

      const result = {
        points: topPoints.map(p => toPlayerShape(p, 'points')),
        rebounds: topRebounds.map(p => toPlayerShape(p, 'rebounds')),
        assists: topAssists.map(p => toPlayerShape(p, 'assists'))
      };

      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch (error) {
      console.error('Error fetching today top performers:', error);
      return { points: [], rebounds: [], assists: [] };
    }
  }
}

module.exports = new NBAService();
