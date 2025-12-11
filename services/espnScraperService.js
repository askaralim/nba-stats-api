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
console.log(url);
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

      // Transform the response
      const transformedData = {
        metadata: {
          season: `${year}-${year + 1}`,
          seasonType: seasonType === 3 ? 'Postseason' : 'Regular Season',
          seasonTypeId: seasonType,
          position: position === 'all-positions' ? 'All Positions' : position,
          totalPages: data.pagination?.pages || 1,
          currentPage: data.pagination?.page || page,
          totalCount: data.pagination?.count || 0,
          limit: data.pagination?.limit || limit,
          categories: metadataCategories.map(cat => ({
            name: cat.name,
            displayName: cat.displayName,
            labels: cat.labels || [],
            names: cat.names || [],
            displayNames: cat.displayNames || [],
            descriptions: cat.descriptions || []
          }))
        },
        pagination: {
          page: data.pagination?.page || page,
          limit: data.pagination?.limit || limit,
          pages: data.pagination?.pages || 1,
          count: data.pagination?.count || 0,
          hasNext: !!data.pagination?.next,
          hasPrev: !!data.pagination?.first && data.pagination?.page > 1
        },
        players: (data.athletes || []).map(athlete => 
          this.transformAthlete(athlete, metadataCategories)
        )
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
