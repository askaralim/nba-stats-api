/**
 * Team Service (ESPN API)
 * Fetches team data and statistics from ESPN API endpoints
 */

class TeamService {
  constructor() {
    this.baseUrl = 'https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/teams';
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes cache
    
    // All 30 NBA team abbreviations
    this.allTeamAbbreviations = [
      'atl', 'bos', 'bkn', 'cha', 'chi', 'cle', 'dal', 'den', 'det', 'gs',
      'hou', 'ind', 'lac', 'lal', 'mem', 'mia', 'mil', 'min', 'no', 'ny',
      'okc', 'orl', 'phi', 'phx', 'por', 'sac', 'sa', 'tor', 'utah', 'was'
    ];
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

  /**
   * Pre-fetch all team info for all 30 NBA teams
   * @param {boolean} forceRefresh - If true, bypass cache and fetch fresh data
   * @returns {Promise<Object>} Object with success count and errors
   */
  async prefetchAllTeamInfo(forceRefresh = false) {
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    console.log(`[TeamService] Pre-fetching team info for ${this.allTeamAbbreviations.length} teams...`);

    // Fetch all teams in parallel (with concurrency limit to avoid overwhelming the API)
    const batchSize = 10; // Process 10 teams at a time
    for (let i = 0; i < this.allTeamAbbreviations.length; i += batchSize) {
      const batch = this.allTeamAbbreviations.slice(i, i + batchSize);
      
      await Promise.allSettled(
        batch.map(async (abbr) => {
          try {
            if (forceRefresh) {
              // Force refresh by clearing cache first
              const cacheKey = `team_info_${abbr}`;
              this.cache.delete(cacheKey);
            }
            await this.getTeamInfo(abbr);
            results.success++;
          } catch (error) {
            results.failed++;
            results.errors.push({ team: abbr, error: error.message });
            console.error(`[TeamService] Failed to fetch team info for ${abbr}:`, error.message);
          }
        })
      );

      // Small delay between batches to be respectful to the API
      if (i + batchSize < this.allTeamAbbreviations.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`[TeamService] Pre-fetch completed: ${results.success} succeeded, ${results.failed} failed`);
    if (results.errors.length > 0) {
      console.error(`[TeamService] Errors:`, results.errors);
    }

    return results;
  }
}

module.exports = new TeamService();

