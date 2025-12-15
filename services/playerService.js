/**
 * Player Service (ESPN API)
 * Fetches player data, statistics, and advanced stats from ESPN API endpoints
 */

const glossaryTranslator = require('../utils/glossaryTranslator');

class PlayerService {
  constructor() {
    this.baseUrl = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes';
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes cache
  }

  /**
   * Translate API response labels and glossary to Chinese
   * @param {Object} data - API response data
   * @returns {Object} Translated data
   */
  translateResponse(data) {
    if (!data) return data;

    const translated = { ...data };

    // Translate labels if present
    if (translated.labels && Array.isArray(translated.labels)) {
      translated.labels = glossaryTranslator.translateLabels(translated.labels);
    }

    // Translate displayNames if present
    if (translated.displayNames && Array.isArray(translated.displayNames)) {
      translated.displayNames = glossaryTranslator.translateLabels(translated.displayNames);
    }

    // Translate glossary if present
    if (translated.glossary && Array.isArray(translated.glossary)) {
      translated.glossary = glossaryTranslator.translateGlossaryArray(translated.glossary);
    }

    // Translate categories if present
    if (translated.categories && Array.isArray(translated.categories)) {
      translated.categories = translated.categories.map(category => {
        const translatedCategory = { ...category };
        
        if (translatedCategory.labels && Array.isArray(translatedCategory.labels)) {
          translatedCategory.labels = glossaryTranslator.translateLabels(translatedCategory.labels);
        }
        
        if (translatedCategory.displayNames && Array.isArray(translatedCategory.displayNames)) {
          translatedCategory.displayNames = glossaryTranslator.translateLabels(translatedCategory.displayNames);
        }
        
        return translatedCategory;
      });
    }

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
}

module.exports = new PlayerService();

