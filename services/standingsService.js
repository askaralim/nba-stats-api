/**
 * ESPN Standings Service
 * Fetches team standings from ESPN API
 */

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

    return {
      id: team.id,
      uid: team.uid,
      name: team.displayName,
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
   * Fetch NBA standings
   * @param {Object} options - Query options
   * @param {number} options.season - Season year (default: 2026)
   * @param {number} options.seasonType - Season type (2=Regular, 3=Playoffs, default: 2)
   * @returns {Promise<Object>} Standings data organized by conference
   */
  async getStandings(options = {}) {
    const {
      season = 2026,
      seasonType = 2
    } = options;

    const cacheKey = `standings_${season}_${seasonType}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
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

      // Cache the response
      this.cache.set(cacheKey, {
        data: transformedData,
        timestamp: Date.now()
      });

      return transformedData;
    } catch (error) {
      console.error('Error fetching standings:', error);
      throw error;
    }
  }
}

module.exports = new StandingsService();

