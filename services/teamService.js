/**
 * Team Service (ESPN API)
 * Fetches team data and statistics from ESPN API endpoints
 */

class TeamService {
  constructor() {
    this.baseUrl = 'https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/teams';
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes cache
  }

  /**
   * Fetch team information
   * @param {string} teamAbbreviation - Team abbreviation (e.g., 'bos', 'lal')
   * @returns {Promise<Object>} Team information
   */
  async getTeamInfo(teamAbbreviation) {
    const cacheKey = `team_info_${teamAbbreviation}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const url = `${this.baseUrl}/${teamAbbreviation.toLowerCase()}?region=us&lang=en`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Cache the response
      this.cache.set(cacheKey, {
        data: data.team,
        timestamp: Date.now()
      });

      return data.team;
    } catch (error) {
      console.error(`Error fetching team info for ${teamAbbreviation}:`, error);
      throw error;
    }
  }

  /**
   * Fetch team statistics and player statistics
   * @param {string} teamAbbreviation - Team abbreviation (e.g., 'bos', 'lal')
   * @returns {Promise<Object>} Team statistics with players
   */
  async getTeamStatistics(teamAbbreviation) {
    const cacheKey = `team_stats_${teamAbbreviation}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const url = `${this.baseUrl}/${teamAbbreviation.toLowerCase()}/athletes/statistics?region=us&lang=en&contentorigin=espn`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Cache the response
      this.cache.set(cacheKey, {
        data: data,
        timestamp: Date.now()
      });

      return data;
    } catch (error) {
      console.error(`Error fetching team statistics for ${teamAbbreviation}:`, error);
      throw error;
    }
  }
}

module.exports = new TeamService();

