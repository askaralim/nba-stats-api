/**
 * NBA Service (ESPN API)
 * Fetches game data from ESPN API endpoints
 */

const gameTransformer = require('../utils/gameTransformer');

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
      const games = scoreboardData.events || [];
      
      // Filter completed games
      const completedGames = games.filter(game => {
        const status = game.status?.type?.name;
        return status === 'STATUS_FINAL';
      });

      if (completedGames.length === 0) {
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

      // Fetch boxscores for all completed games
      const boxscorePromises = completedGames.map(game => 
        this.getGameSummary(game.id).catch(() => null)
      );
      
      const boxscores = await Promise.all(boxscorePromises);
      
      // Extract all players from all games using gameTransformer
      const allPlayers = [];
      
      boxscores.forEach((boxscore, index) => {
        if (!boxscore?.boxscore) return;
        
        // Use gameTransformer to transform boxscore
        const transformedBoxscore = gameTransformer.transformBoxscore(boxscore.boxscore);
        
        if (!transformedBoxscore?.teams) return;
        
        transformedBoxscore.teams.forEach(team => {
          const teamName = team.teamName || '';
          const teamAbbreviation = team.teamAbbreviation || '';
          
          // Process all players (starters + bench)
          const players = [
            ...(team.starters || []),
            ...(team.bench || [])
          ];
          
          players.forEach(player => {
            if (!player?.athleteId || !player?.stats) return;
            
            const points = parseInt(player.stats.points) || 0;
            const rebounds = parseInt(player.stats.rebounds) || 0;
            const assists = parseInt(player.stats.assists) || 0;
            
            if (points > 0 || rebounds > 0 || assists > 0) {
              allPlayers.push({
                id: player.athleteId,
                name: player.name || '',
                team: teamName,
                teamAbbreviation: teamAbbreviation,
                headshot: player.headshot || null,
                points: points,
                rebounds: rebounds,
                assists: assists
              });
            }
          });
        });
      });

      // Get top 3 for each category
      const topPoints = [...allPlayers]
        .sort((a, b) => b.points - a.points)
        .slice(0, 3);
      
      const topRebounds = [...allPlayers]
        .sort((a, b) => b.rebounds - a.rebounds)
        .slice(0, 3);
      
      const topAssists = [...allPlayers]
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
