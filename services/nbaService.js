/**
 * NBA Service (ESPN API)
 * Fetches game data from ESPN API endpoints
 */

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
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
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
   * Fetch game details by game ID
   * @param {string} gameId - Game ID
   * @returns {Promise<Object>} Game details
   */
  async getGameDetails(gameId) {
    const cacheKey = `game_${gameId}`;
    const cached = this.cache.get(cacheKey);
    
    // Cache game details for 30 seconds (shorter for live games)
    if (cached && Date.now() - cached.timestamp < 30000) {
      return cached.data;
    }

    try {
      // Get scoreboard and find the game (try today first, then search recent dates if needed)
      let scoreboard = await this.getTodaysScoreboard();
      let event = scoreboard.events?.find(e => e.id === gameId);
      
      // If not found, try yesterday and tomorrow
      if (!event) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        scoreboard = await this.getScoreboard(yesterday);
        event = scoreboard.events?.find(e => e.id === gameId);
      }
      
      if (!event) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        scoreboard = await this.getScoreboard(tomorrow);
        event = scoreboard.events?.find(e => e.id === gameId);
      }
      
      if (!event) {
        throw new Error(`Game ${gameId} not found in today's scoreboard`);
      }

      // Cache the game
      this.cache.set(cacheKey, {
        data: event,
        timestamp: Date.now()
      });

      return event;
    } catch (error) {
      console.error('Error fetching game details:', error);
      throw error;
    }
  }

  /**
   * Fetch game summary (boxscore) by game ID
   * @param {string} gameId - Game ID
   * @returns {Promise<Object>} Game summary with boxscore data
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
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
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
      console.error('Error fetching game summary:', error);
      throw error;
    }
  }
}

module.exports = new NBAService();
