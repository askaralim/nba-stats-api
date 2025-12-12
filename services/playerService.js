/**
 * Player Service (ESPN API)
 * Fetches player data, statistics, and advanced stats from ESPN API endpoints
 */

class PlayerService {
  constructor() {
    this.baseUrl = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes';
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes cache
  }

  /**
   * Fetch player bio information
   * @param {string|number} playerId - Player ID
   * @returns {Promise<Object>} Player bio data
   */
  async getPlayerBio(playerId) {
    const cacheKey = `player_bio_${playerId}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const params = new URLSearchParams({
        region: 'us',
        lang: 'en',
        contentorigin: 'espn'
      });

      const url = `${this.baseUrl}/${playerId}/bio?${params.toString()}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });

      if (!response.ok) {
        throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Cache the result
      this.cache.set(cacheKey, {
        data: data,
        timestamp: Date.now()
      });

      return data;
    } catch (error) {
      console.error(`Error fetching player bio for ${playerId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch player regular statistics
   * @param {string|number} playerId - Player ID
   * @returns {Promise<Object>} Player statistics data
   */
  async getPlayerStats(playerId) {
    const cacheKey = `player_stats_${playerId}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const params = new URLSearchParams({
        region: 'us',
        lang: 'en',
        contentorigin: 'espn'
      });

      const url = `${this.baseUrl}/${playerId}/stats?${params.toString()}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });

      if (!response.ok) {
        throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Cache the result
      this.cache.set(cacheKey, {
        data: data,
        timestamp: Date.now()
      });

      return data;
    } catch (error) {
      console.error(`Error fetching player stats for ${playerId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch player basic information
   * @param {string|number} playerId - Player ID
   * @returns {Promise<Object>} Player basic info (name, photo, team, etc.)
   */
  async getPlayerInfo(playerId) {
    const cacheKey = `player_info_${playerId}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const params = new URLSearchParams({
        region: 'us',
        lang: 'en',
        contentorigin: 'espn'
      });

      const url = `${this.baseUrl}/${playerId}?${params.toString()}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });

      if (!response.ok) {
        throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Cache the result
      this.cache.set(cacheKey, {
        data: data,
        timestamp: Date.now()
      });

      return data;
    } catch (error) {
      console.error(`Error fetching player info for ${playerId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch player advanced statistics
   * @param {string|number} playerId - Player ID
   * @returns {Promise<Object>} Player advanced statistics data
   */
  async getPlayerAdvancedStats(playerId) {
    const cacheKey = `player_advanced_stats_${playerId}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const params = new URLSearchParams({
        region: 'us',
        lang: 'en',
        contentorigin: 'espn',
        advanced: 'true'
      });

      const url = `${this.baseUrl}/${playerId}/stats?${params.toString()}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });

      if (!response.ok) {
        throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Cache the result
      this.cache.set(cacheKey, {
        data: data,
        timestamp: Date.now()
      });

      return data;
    } catch (error) {
      console.error(`Error fetching player advanced stats for ${playerId}:`, error);
      throw error;
    }
  }
}

module.exports = new PlayerService();

