/**
 * NBA Service (ESPN API)
 * Fetches game data from ESPN API endpoints
 */

const gameTransformer = require('../utils/gameTransformer');
const { fetchWithRetry } = require('../utils/retry');

class NBAService {
  constructor() {
    this.baseUrl = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
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
    
    // Cache game details for 30 seconds
    if (cached && Date.now() - cached.timestamp < 30000) {
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
    
    // Cache summary for 30 seconds
    if (cached && Date.now() - cached.timestamp < 30000) {
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
   * Get today's top performers from completed games
   * @param {string} date - Date in YYYYMMDD format
   * @returns {Promise<Object>} Top performers for today (points, rebounds, assists)
   */
  async getTodayTopPerformers(date = null) {
    const dateStr = date || this.formatDateForAPI(new Date());
    const cacheKey = `today_top_${dateStr}`;
    const cached = this.cache.get(cacheKey);
    
    // Cache for 5 minutes
    if (cached && Date.now() - cached.timestamp < 300000) {
      return cached.data;
    }

    try {
      const scoreboardData = await this.getScoreboard(dateStr);
      const events = scoreboardData.events || [];
      
      if (events.length === 0) {
        const emptyResult = {
          points: [],
          rebounds: [],
          assists: []
        };
        this.cache.set(cacheKey, {
          data: emptyResult,
          timestamp: Date.now()
        });
        return emptyResult;
      }

      // Extract all players from leaders in scoreboard data
      // Works for both completed AND in-progress games!
      const allPlayers = new Map(); // Use Map to deduplicate by player ID
      
      events.forEach(event => {
        const competition = event.competitions?.[0];
        if (!competition?.competitors) return;
        
        competition.competitors.forEach(competitor => {
          const teamName = competitor.team?.displayName || competitor.team?.name || '';
          const teamAbbreviation = competitor.team?.abbreviation || '';
          
          // Extract leaders (top performers) for this team
          // Structure: leaders is an array of stat categories (points, rebounds, assists, etc.)
          // Each category has a nested leaders array with athlete and value
          const statCategories = competitor.leaders || [];
          
          statCategories.forEach(category => {
            const categoryName = category.name?.toLowerCase();
            if (!categoryName || !category.leaders || !Array.isArray(category.leaders)) return;
            
            // Process each leader in this category
            category.leaders.forEach(leader => {
              const athlete = leader.athlete;
              if (!athlete?.id) return;
              
              const statValue = parseInt(leader.displayValue || leader.value || 0);
              
              // Update or create player entry
              const playerId = athlete.id;
              if (allPlayers.has(playerId)) {
                const existing = allPlayers.get(playerId);
                // Update the stat for this category
                if (categoryName === 'points') {
                  existing.points = Math.max(existing.points, statValue);
                } else if (categoryName === 'rebounds') {
                  existing.rebounds = Math.max(existing.rebounds, statValue);
                } else if (categoryName === 'assists') {
                  existing.assists = Math.max(existing.assists, statValue);
                }
              } else {
                // Create new player entry
                const player = {
                  id: playerId,
                  name: athlete.fullName || athlete.displayName || athlete.shortName || '',
                  team: teamName,
                  teamAbbreviation: teamAbbreviation,
                  headshot: athlete.headshot?.href || athlete.headshot || null,
                  points: 0,
                  rebounds: 0,
                  assists: 0
                };
                
                // Set the stat value for this category
                if (categoryName === 'points') {
                  player.points = statValue;
                } else if (categoryName === 'rebounds') {
                  player.rebounds = statValue;
                } else if (categoryName === 'assists') {
                  player.assists = statValue;
                }
                
                allPlayers.set(playerId, player);
              }
            });
          });
        });
      });

      // Convert Map to Array and get top 3 for each category
      const playersArray = Array.from(allPlayers.values());
      
      const topPoints = [...playersArray]
        .filter(p => p.points > 0)
        .sort((a, b) => b.points - a.points)
        .slice(0, 3);
      
      const topRebounds = [...playersArray]
        .filter(p => p.rebounds > 0)
        .sort((a, b) => b.rebounds - a.rebounds)
        .slice(0, 3);
      
      const topAssists = [...playersArray]
        .filter(p => p.assists > 0)
        .sort((a, b) => b.assists - a.assists)
        .slice(0, 3);

      const result = {
        points: topPoints,
        rebounds: topRebounds,
        assists: topAssists
      };

      // Cache the result
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });

      return result;
    } catch (error) {
      console.error('Error fetching today top performers:', error);
      return {
        points: [],
        rebounds: [],
        assists: []
      };
    }
  }
}

module.exports = new NBAService();
