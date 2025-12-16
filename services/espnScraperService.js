/**
 * ESPN API Service
 * Fetches player stats from ESPN API
 */

class ESPNScraperService {
  constructor() {
    this.baseUrl = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete';
    this.cache = new Map();
    this.cacheTimeout = 3600000; // 1 hour cache
  }

  /**
   * Map position filter to ESPN API position code
   * @param {string} position - Position filter (all-positions, point-guard, shooting-guard, etc.)
   * @returns {number|undefined} ESPN position code (2=G, 6=F, 8=C) or undefined for All
   */
  mapPosition(position) {
    if (!position || position === 'all-positions') {
      return undefined; // Don't include position parameter for All
    }
    
    // Map position filters to ESPN codes
    const positionMap = {
      'guard': '2%2C3%2C4',      // G
      'forward': '6%2C7%2C8',    // F
      'center': '8%2C9'  // C
    };

    return positionMap[position];
  }

  /**
   * Parse season string to extract year and season type
   * @param {string} season - Season string (e.g., "2026|2" or "2026")
   * @returns {Object} { year, seasonType }
   */
  parseSeason(season) {
    if (!season) {
      return { year: 2026, seasonType: 2 }; // Default to current regular season
    }

    const parts = season.split('|');
    const year = parseInt(parts[0]) || 2026;
    const seasonType = parts[1] ? parseInt(parts[1]) : 2; // Default to regular season

    return { year, seasonType };
  }

  /**
   * Transform ESPN API athlete data to our format
   * @param {Object} athleteData - ESPN API athlete object
   * @param {Array} metadataCategories - Metadata categories from API response
   * @returns {Object} Transformed player data
   */
  transformAthlete(athleteData, metadataCategories = []) {
    const athlete = athleteData.athlete;
    const athleteCategories = athleteData.categories || [];

    // Create a map of metadata categories by name for quick lookup
    const metadataMap = {};
    metadataCategories.forEach(metaCat => {
      metadataMap[metaCat.name] = metaCat;
    });

    // Extract stats from categories
    const stats = {};
    
    // Process each category (general, offensive, defensive)
    athleteCategories.forEach(athleteCategory => {
      const categoryName = athleteCategory.name;
      const metadataCategory = metadataMap[categoryName];
      
      if (!metadataCategory) {
        console.warn(`No metadata found for category: ${categoryName}`);
        return;
      }

      const names = metadataCategory.names || [];
      const labels = metadataCategory.labels || [];
      const displayNames = metadataCategory.displayNames || [];
      const descriptions = metadataCategory.descriptions || [];
      
      const values = athleteCategory.values || [];
      const totals = athleteCategory.totals || [];
      const ranks = athleteCategory.ranks || [];

      // Map stats by name using metadata
      names.forEach((name, index) => {
        if (values[index] !== undefined) {
          stats[name] = {
            value: values[index],
            total: totals[index] || null,
            rank: ranks[index] || null,
            label: labels[index] || null,
            displayName: displayNames[index] || null,
            description: descriptions[index] || null,
            category: categoryName
          };
        }
      });
    });

    return {
      id: athlete.id || athlete.uid || null,
      uid: athlete.uid || null,
      name: athlete.displayName || `${athlete.firstName} ${athlete.lastName}` || '',
      shortName: athlete.shortName || '',
      firstName: athlete.firstName || '',
      lastName: athlete.lastName || '',
      position: athlete.position?.abbreviation || athlete.position?.name || '',
      positionId: athlete.position?.id || null,
      team: athlete.teamName || athlete.teamShortName || '',
      teamId: athlete.teamId || null,
      teamLogo: athlete.teamLogos?.[0]?.href || null,
      headshot: athlete.headshot?.href || null,
      age: athlete.age || null,
      href: athlete.links?.[0]?.href || null,
      stats: stats
    };
  }

  /**
   * Flatten player stats structure for easier frontend consumption
   * @param {Object} player - Player object with nested stats
   * @returns {Object} Player with flattened stats
   */
  flattenPlayerStats(player) {
    const flattened = {
      id: player.id,
      uid: player.uid,
      name: player.name,
      shortName: player.shortName,
      firstName: player.firstName,
      lastName: player.lastName,
      position: player.position,
      positionId: player.positionId,
      team: player.team,
      teamId: player.teamId,
      teamLogo: player.teamLogo,
      headshot: player.headshot,
      age: player.age,
      href: player.href,
      // Flatten stats - extract value, rank, and formatted display value
      stats: {}
    };

    // Flatten stats object
    Object.keys(player.stats || {}).forEach(statName => {
      const stat = player.stats[statName];
      flattened.stats[statName] = {
        value: stat.value ?? stat.total ?? null,
        rank: stat.rank ?? null,
        displayValue: this.formatStatValue(statName, stat.value ?? stat.total),
        label: stat.label,
        displayName: stat.displayName,
        description: stat.description,
        category: stat.category
      };
    });

    return flattened;
  }

  /**
   * Format stat value based on stat name
   * @param {string} statName - Stat name
   * @param {number|null} value - Stat value
   * @returns {string} Formatted value
   */
  formatStatValue(statName, value) {
    if (value === null || value === undefined) return '-';
    
    // Format percentage stats
    if (statName.includes('Pct') || statName.includes('Percent')) {
      return `${parseFloat(value).toFixed(1)}%`;
    }
    
    // Format decimal stats (averages)
    if (statName.startsWith('avg')) {
      return parseFloat(value).toFixed(1);
    }
    
    // Return integer for counts
    return Math.round(value).toString();
  }

  /**
   * Minimize player data to only what frontend needs
   * @param {Object} player - Full player object
   * @param {string} statName - Stat name to include
   * @returns {Object} Minimized player object
   */
  minimizePlayerData(player, statName) {
    return {
      id: player.id,
      name: player.name,
      headshot: player.headshot,
      team: player.team,
      teamLogo: player.teamLogo,
      position: player.position,
      statRank: player.statRank,
      stats: {
        // Only include the specific stat and gamesPlayed
        [statName]: player.stats?.[statName] || null,
        gamesPlayed: player.stats?.gamesPlayed || null
      }
    };
  }

  /**
   * Get top players for a specific stat
   * @param {Array} players - Array of flattened player objects
   * @param {string} statName - Stat name to sort by
   * @param {number} count - Number of top players to return
   * @returns {Array} Top players sorted by stat value (minimized data)
   */
  getTopPlayersByStat(players, statName, count = 10) {
    return [...players]
      .filter(player => {
        const stat = player.stats?.[statName];
        const value = stat?.value;
        return value !== null && value !== undefined && value !== '-' && !isNaN(parseFloat(value));
      })
      .sort((a, b) => {
        const valA = parseFloat(a.stats[statName].value);
        const valB = parseFloat(b.stats[statName].value);
        return valB - valA; // Descending order
      })
      .slice(0, count)
      .map((player, index) => {
        // Parse rank from API (it might be a string)
        const apiRank = player.stats[statName]?.rank;
        const parsedRank = apiRank ? (typeof apiRank === 'string' ? parseInt(apiRank) : apiRank) : null;
        
        // Create minimized player object with only needed data
        const minimizedPlayer = {
          ...player,
          // Use API rank if available and valid, otherwise use sorted position
          statRank: parsedRank && parsedRank > 0 ? parsedRank : index + 1
        };
        
        // Return only what frontend needs
        return this.minimizePlayerData(minimizedPlayer, statName);
      });
  }

  /**
   * Fetch player stats from ESPN API
   * @param {Object} options - Query options
   * @param {string} options.season - Season (e.g., "2026|2" for 2025-26 Regular Season, "2026|3" for postseason)
   * @param {string} options.position - Position filter (all-positions, point-guard, shooting-guard, small-forward, power-forward, center)
   * @param {string} options.conference - Conference filter (not used in ESPN API, kept for compatibility)
   * @param {number} options.page - Page number (default: 1)
   * @param {number} options.limit - Items per page (default: 50)
   * @param {string} options.sort - Sort field (e.g., "offensive.avgPoints:desc")
   * @returns {Promise<Object>} Player stats data
   */
  async getPlayerStats(options = {}) {
    const {
      season = '2026|2',
      position = 'all-positions',
      conference = '0', // Not used in ESPN API but kept for compatibility
      page = 1,
      limit = 50,
      sort = 'offensive.avgPoints:desc'
    } = options;

    const { year, seasonType } = this.parseSeason(season);
    const positionCode = this.mapPosition(position);

    const cacheKey = `espn_stats_${year}_${seasonType}_${position || 'all'}_${page}_${limit}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      // Build URL with query parameters
      const params = new URLSearchParams({
        region: 'us',
        lang: 'en',
        contentorigin: 'espn',
        isqualified: 'true',
        page: page.toString(),
        limit: limit.toString(),
        sort: sort,
        season: year.toString(),
        seasontype: seasonType.toString()
      });

      // Only add position if specified
      if (positionCode !== undefined) {
        params.append('position', positionCode.toString());
      }

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

      // Get metadata categories from API response
      const metadataCategories = data.categories || [];

      // Transform athletes to our format
      const transformedPlayers = (data.athletes || []).map(athlete => 
        this.transformAthlete(athlete, metadataCategories)
      );

      // Flatten player stats for easier frontend consumption
      const flattenedPlayers = transformedPlayers.map(player => 
        this.flattenPlayerStats(player)
      );

      // Define stat categories for top players calculation
      const statCategories = [
        { statName: 'avgPoints', title: '场均得分', description: 'Points Per Game' },
        { statName: 'avgAssists', title: '场均助攻', description: 'Assists Per Game' },
        { statName: 'avgRebounds', title: '场均篮板', description: 'Rebounds Per Game' },
        { statName: 'avgSteals', title: '场均抢断', description: 'Steals Per Game' },
        { statName: 'avgBlocks', title: '场均盖帽', description: 'Blocks Per Game' },
        { statName: 'doubleDouble', title: '两双次数', description: 'Double Double' },
        { statName: 'tripleDouble', title: '三双次数', description: 'Triple Double' },
        { statName: 'avgThreePointFieldGoalsMade', title: '场均三分命中', description: 'Average 3-Point Field Goals Made' },
        { statName: 'fieldGoalPct', title: '投篮命中率', description: 'Field Goal Percentage' },
        { statName: 'threePointFieldGoalPct', title: '三分命中率', description: '3-Point Field Goal Percentage' }
      ];

      // Pre-calculate top players for each stat category
      const topPlayersByStat = {};
      statCategories.forEach(category => {
        topPlayersByStat[category.statName] = {
          title: category.title,
          description: category.description,
          players: this.getTopPlayersByStat(flattenedPlayers, category.statName, 9)
        };
      });

      // Transform the response - only return what frontend needs
      const transformedData = {
        metadata: {
          season: `${year}-${year + 1}`,
          seasonType: seasonType === 3 ? 'Postseason' : 'Regular Season',
          seasonTypeId: seasonType,
          position: position === 'all-positions' ? 'All Positions' : position,
          totalCount: data.pagination?.count || 0
        },
        // Only return topPlayersByStat - frontend doesn't need full players array
        topPlayersByStat: topPlayersByStat
      };

      // Cache the response
      this.cache.set(cacheKey, {
        data: transformedData,
        timestamp: Date.now()
      });

      return transformedData;
    } catch (error) {
      console.error('Error fetching ESPN player stats:', error);
      throw error;
    }
  }
}

module.exports = new ESPNScraperService();
