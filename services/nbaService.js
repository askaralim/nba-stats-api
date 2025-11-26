/**
 * NBA API Service
 * Fetches data from NBA's official API endpoints
 */

class NBAService {
  constructor() {
    this.baseUrl = 'https://cdn.nba.com/static/json/liveData';
    this.cache = new Map();
    this.cacheTimeout = 5000; // 5 seconds cache
  }

  /**
   * Fetch today's scoreboard
   * @param {string} leagueId - League ID (default: '00' for NBA)
   * @returns {Promise<Object>} Scoreboard data
   */
  async getTodaysScoreboard(leagueId = '00') {
    const cacheKey = `scoreboard_${leagueId}_${new Date().toDateString()}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const url = `${this.baseUrl}/scoreboard/todaysScoreboard_${leagueId}.json`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`NBA API error: ${response.status} ${response.statusText}`);
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
      // First, get today's scoreboard to find the game
      const scoreboard = await this.getTodaysScoreboard();
      const game = scoreboard.scoreboard?.games?.find(g => g.gameId === gameId);
      
      if (!game) {
        throw new Error(`Game ${gameId} not found in today's scoreboard`);
      }

      // Cache the game
      this.cache.set(cacheKey, {
        data: game,
        timestamp: Date.now()
      });

      return game;
    } catch (error) {
      console.error('Error fetching game details:', error);
      throw error;
    }
  }
}

module.exports = new NBAService();

