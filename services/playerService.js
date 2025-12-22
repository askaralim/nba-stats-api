/**
 * Player Service (ESPN API)
 * Fetches player data, statistics, and advanced stats from ESPN API endpoints
 */

class PlayerService {
  constructor() {
    this.baseUrl = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes';
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes cache
    
    // Game log stat order: 得分，篮板，助攻，盖帽，抢断，犯规，失误，出手，命中率，三分，三分%，罚球，罚球%
    this.gameLogStatOrder = [
      'points',
      'totalRebounds',
      'assists',
      'blocks',
      'steals',
      'fouls',
      'turnovers',
      'fieldGoalsMade-fieldGoalsAttempted',
      'fieldGoalPct',
      'threePointFieldGoalsMade-threePointFieldGoalsAttempted',
      'threePointPct',
      'freeThrowsMade-freeThrowsAttempted',
      'freeThrowPct'
    ];
    
    // Player stats order: 场次，先发，时间，得分，篮板，进攻篮板，防守篮板，助攻，盖帽，抢断，犯规，失误，出手，命中率，三分，三分%，罚球，罚球%
    this.playerStatsOrder = [
      'gamesPlayed',
      'gamesStarted',
      'avgMinutes',
      'avgPoints',
      'avgRebounds',
      'avgOffensiveRebounds',
      'avgDefensiveRebounds',
      'avgAssists',
      'avgBlocks',
      'avgSteals',
      'avgFouls',
      'avgTurnovers',
      'avgFieldGoalsMade-avgFieldGoalsAttempted',
      'fieldGoalPct',
      'avgThreePointFieldGoalsMade-avgThreePointFieldGoalsAttempted',
      'threePointFieldGoalPct',
      'avgFreeThrowsMade-avgFreeThrowsAttempted',
      'freeThrowPct'
    ];
  }

  /**
   * Reorder arrays based on desired order
   * @param {Array} items - Items to reorder
   * @param {Array} order - Desired order (array of keys/names)
   * @param {Array} sourceNames - Source names array to match against
   * @returns {Array} Reordered items
   */
  reorderArrays(items, order, sourceNames) {
    if (!items || !order || !sourceNames) return items;
    
    const reordered = [];
    const sourceMap = new Map();
    
    // Create a map of source names to their indices
    sourceNames.forEach((name, index) => {
      sourceMap.set(name, index);
    });
    
    // Reorder based on desired order
    order.forEach(name => {
      const index = sourceMap.get(name);
      if (index !== undefined && items[index] !== undefined) {
        reordered.push(items[index]);
      }
    });
    
    return reordered;
  }

  /**
   * Translate API response labels and glossary to Chinese
   * @param {Object} data - API response data
   * @returns {Object} Translated data
   */
  translateResponse(data) {
    if (!data) return data;

    // Return data as-is (translation removed - glossaryTranslator was deleted)
    const translated = { ...data };

    // Translate seasonTypes if present (for game log)
    if (translated.seasonTypes && Array.isArray(translated.seasonTypes)) {
      translated.seasonTypes = translated.seasonTypes.map(seasonType => {
        const translatedSeasonType = { ...seasonType };
        
        if (translatedSeasonType.categories && Array.isArray(translatedSeasonType.categories)) {
          translatedSeasonType.categories = translatedSeasonType.categories.map(category => {
            const translatedCategory = { ...category };
            // Note: category events don't need translation, they're game data
            return translatedCategory;
          });
        }
        
        return translatedSeasonType;
      });
    }

    return translated;
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

      // Bio data doesn't typically have labels/glossary, but translate if present
      const translatedData = this.translateResponse(data);

      // Cache the translated result
      this.cache.set(cacheKey, {
        data: translatedData,
        timestamp: Date.now()
      });

      return translatedData;
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

      // Translate labels and glossary
      const translatedData = this.translateResponse(data);

      // Cache the translated result
      this.cache.set(cacheKey, {
        data: translatedData,
        timestamp: Date.now()
      });

      return translatedData;
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

      // Player info doesn't typically have labels/glossary, but translate if present
      const translatedData = this.translateResponse(data);

      // Cache the translated result
      this.cache.set(cacheKey, {
        data: translatedData,
        timestamp: Date.now()
      });

      return translatedData;
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

      // Translate labels and glossary
      const translatedData = this.translateResponse(data);

      // Cache the translated result
      this.cache.set(cacheKey, {
        data: translatedData,
        timestamp: Date.now()
      });

      return translatedData;
    } catch (error) {
      console.error(`Error fetching player advanced stats for ${playerId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch player game log
   * @param {string|number} playerId - Player ID
   * @returns {Promise<Object>} Player game log data
   */
  async getPlayerGameLog(playerId) {
    const cacheKey = `player_gamelog_${playerId}`;
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

      const url = `${this.baseUrl}/${playerId}/gamelog?${params.toString()}`;

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

      // Translate labels and glossary
      const translatedData = this.translateResponse(data);

      // Cache the translated result
      this.cache.set(cacheKey, {
        data: translatedData,
        timestamp: Date.now()
      });

      return translatedData;
    } catch (error) {
      console.error(`Error fetching player game log for ${playerId}:`, error);
      throw error;
    }
  }

  /**
   * Get clean player details (info + basic data)
   * @param {string|number} playerId - Player ID
   * @returns {Promise<Object>} Clean player details
   */
  async getPlayerDetails(playerId) {
    const cacheKey = `player_details_${playerId}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const playerInfo = await this.getPlayerInfo(playerId);
      const athlete = playerInfo?.athlete;

      if (!athlete) {
        throw new Error('Player data not found');
      }

      const details = {
        id: athlete.id,
        name: athlete.displayName || athlete.fullName || athlete.shortName || 'Unknown',
        photo: athlete.headshot?.href || null,
        team: athlete.team ? {
          id: athlete.team.id,
          name: athlete.team.displayName || `${athlete.team.location} ${athlete.team.name}`,
          abbreviation: athlete.team.abbreviation,
          logo: athlete.team.logos?.[0]?.href || null
        } : null,
        jersey: athlete.displayJersey || athlete.jersey || null,
        position: athlete.position?.displayName || athlete.position?.abbreviation || null,
        height: athlete.displayHeight || null,
        weight: athlete.displayWeight || null,
        dob: athlete.displayDOB || null,
        age: athlete.age || null,
        college: athlete.college?.name || null,
        draft: athlete.displayDraft || null,
        experience: athlete.displayExperience || null,
        active: athlete.active !== undefined ? athlete.active : null
      };

      this.cache.set(cacheKey, {
        data: details,
        timestamp: Date.now()
      });

      return details;
    } catch (error) {
      console.error(`Error getting player details for ${playerId}:`, error);
      throw error;
    }
  }

  /**
   * Get current season stats (flattened)
   * @param {string|number} playerId - Player ID
   * @returns {Promise<Object|null>} Current season stats or null
   */
  async getPlayerCurrentSeasonStats(playerId) {
    try {
      const statsData = await this.getPlayerStats(playerId);
      if (!statsData?.categories) return null;

      const averagesCategory = statsData.categories.find(cat => cat.name === 'averages');
      if (!averagesCategory?.statistics) return null;

      const seasons = averagesCategory.statistics;
      if (seasons.length === 0) return null;

      // Get the most recent season (last in array)
      const currentSeason = seasons[seasons.length - 1];
      const labels = averagesCategory.labels || [];
      const names = averagesCategory.names || [];

      const stats = {};
      labels.forEach((label, index) => {
        if (names[index] && currentSeason.stats[index] !== undefined) {
          stats[names[index]] = currentSeason.stats[index];
        }
      });

      return {
        season: currentSeason.season?.displayName || 'Current',
        stats: stats
      };
    } catch (error) {
      console.error(`Error getting current season stats for ${playerId}:`, error);
      return null;
    }
  }

  /**
   * Get regular season stats (with labels and all seasons)
   * @param {string|number} playerId - Player ID
   * @returns {Promise<Object|null>} Regular season stats or null
   */
  async getPlayerRegularSeasonStats(playerId) {
    try {
      const statsData = await this.getPlayerStats(playerId);
      if (!statsData?.categories) return null;

      const averagesCategory = statsData.categories.find(cat => cat.name === 'averages');
      if (!averagesCategory) return null;

      // Reorder labels, names, and displayNames according to desired order
      const originalLabels = averagesCategory.labels || [];
      const originalNames = averagesCategory.names || [];
      const originalDisplayNames = averagesCategory.displayNames || [];
      
      const reorderedLabels = this.reorderArrays(originalLabels, this.playerStatsOrder, originalNames);
      const reorderedNames = this.reorderArrays(originalNames, this.playerStatsOrder, originalNames);
      const reorderedDisplayNames = this.reorderArrays(originalDisplayNames, this.playerStatsOrder, originalNames);
      
      // Map statistics and reverse order (newest season first), also reorder stats
      const statistics = (averagesCategory.statistics || [])
        .map(stat => ({
          season: stat.season?.displayName || '-',
          stats: this.reorderArrays(stat.stats || [], this.playerStatsOrder, originalNames)
        }))
        .reverse(); // Reverse to show current season first

      const totals = this.reorderArrays(averagesCategory.totals || [], this.playerStatsOrder, originalNames);

      return {
        labels: reorderedLabels,
        names: reorderedNames,
        displayNames: reorderedDisplayNames,
        statistics: statistics,
        totals: totals
      };
    } catch (error) {
      console.error(`Error getting regular season stats for ${playerId}:`, error);
      return null;
    }
  }

  /**
   * Get advanced stats (with labels and glossary)
   * @param {string|number} playerId - Player ID
   * @returns {Promise<Object|null>} Advanced stats or null
   */
  async getPlayerAdvancedStatsData(playerId) {
    try {
      const advancedStatsData = await this.getPlayerAdvancedStats(playerId);
      if (!advancedStatsData?.categories) return null;

      const advancedCategory = advancedStatsData.categories.find(cat => cat.name === 'advanced');
      if (!advancedCategory) return null;

      // Map statistics and reverse order (newest season first)
      // Note: Advanced stats keep their original order as they have different stats
      const statistics = (advancedCategory.statistics || [])
        .map(stat => ({
          season: stat.season?.displayName || '-',
          stats: stat.stats || []
        }))
        .reverse(); // Reverse to show current season first

      return {
        labels: advancedCategory.labels || [],
        names: advancedCategory.names || [],
        displayNames: advancedCategory.displayNames || [],
        statistics: statistics,
        glossary: advancedStatsData.glossary || []
      };
    } catch (error) {
      console.error(`Error getting advanced stats for ${playerId}:`, error);
      return null;
    }
  }

  /**
   * Get last 5 games (flattened)
   * @param {string|number} playerId - Player ID
   * @returns {Promise<Object|null>} Last 5 games or null
   */
  async getPlayerLast5Games(playerId) {
    try {
      const gameLogData = await this.getPlayerGameLog(playerId);
      if (!gameLogData?.seasonTypes) return null;

      // Find the current regular season
      const regularSeason = gameLogData.seasonTypes.find(st => 
        st.displayName && st.displayName.includes('Regular Season')
      );

      if (!regularSeason?.categories) return null;

      // Get all events from all categories (months)
      const allEvents = [];
      regularSeason.categories.forEach(category => {
        if (category.events && Array.isArray(category.events)) {
          category.events.forEach(event => {
            const eventDetails = gameLogData.events?.[event.eventId] || {};
            allEvents.push({
              eventId: event.eventId,
              stats: event.stats || [],
              gameDate: eventDetails.gameDate || event.gameDate,
              score: eventDetails.score,
              gameResult: eventDetails.gameResult,
              opponent: eventDetails.opponent,
              atVs: eventDetails.atVs,
              homeTeamId: eventDetails.homeTeamId,
              awayTeamId: eventDetails.awayTeamId,
              homeTeamScore: eventDetails.homeTeamScore,
              awayTeamScore: eventDetails.awayTeamScore
            });
          });
        }
      });

      // Sort by date (most recent first) and take last 5
      const sortedEvents = allEvents.sort((a, b) => {
        const dateA = a.gameDate ? new Date(a.gameDate) : new Date(0);
        const dateB = b.gameDate ? new Date(b.gameDate) : new Date(0);
        return dateB - dateA;
      }).slice(0, 5);

      if (sortedEvents.length === 0) return null;

      // Reorder labels, names, and displayNames according to desired order
      const originalLabels = gameLogData.labels || [];
      const originalNames = gameLogData.names || [];
      const originalDisplayNames = gameLogData.displayNames || [];
      
      const reorderedLabels = this.reorderArrays(originalLabels, this.gameLogStatOrder, originalNames);
      const reorderedNames = this.reorderArrays(originalNames, this.gameLogStatOrder, originalNames);
      const reorderedDisplayNames = this.reorderArrays(originalDisplayNames, this.gameLogStatOrder, originalNames);
      
      // Reorder stats in each event
      const reorderedEvents = sortedEvents.map(event => {
        const reorderedStats = this.reorderArrays(event.stats || [], this.gameLogStatOrder, originalNames);
        return {
          ...event,
          stats: reorderedStats
        };
      });

      return {
        labels: reorderedLabels,
        names: reorderedNames,
        displayNames: reorderedDisplayNames,
        events: reorderedEvents
      };
    } catch (error) {
      console.error(`Error getting last 5 games for ${playerId}:`, error);
      return null;
    }
  }

  /**
   * Get clean bio data (without teamHistory)
   * @param {string|number} playerId - Player ID
   * @returns {Promise<Object|null>} Clean bio data or null
   */
  async getPlayerBioData(playerId) {
    try {
      const bioData = await this.getPlayerBio(playerId);
      if (!bioData) return null;

      // Remove teamHistory as it's irrelevant
      const { teamHistory, ...cleanBio } = bioData;

      return cleanBio;
    } catch (error) {
      console.error(`Error getting bio data for ${playerId}:`, error);
      return null;
    }
  }
}

module.exports = new PlayerService();

