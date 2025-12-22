/**
 * Game Summary Cache Service
 * Caches AI-generated game summaries with 7+ days expiration
 */

class GameSummaryCache {
  constructor() {
    this.cache = new Map();
    this.cacheExpiration = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  }

  /**
   * Get cached summary for a game
   * @param {string} gameId - Game ID
   * @returns {Object|null} Cached summary with metadata or null
   */
  get(gameId) {
    const cached = this.cache.get(gameId);
    if (!cached) {
      return null;
    }

    // Check if expired
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(gameId);
      return null;
    }

    return {
      summary: cached.summary,
      source: cached.source, // 'ai' or 'fallback'
      generatedAt: cached.generatedAt
    };
  }

  /**
   * Store summary in cache
   * @param {string} gameId - Game ID
   * @param {string} summary - Summary text
   * @param {string} source - Source type ('ai' or 'fallback')
   */
  set(gameId, summary, source = 'ai') {
    this.cache.set(gameId, {
      summary,
      source,
      generatedAt: new Date().toISOString(),
      expiresAt: Date.now() + this.cacheExpiration
    });
  }

  /**
   * Check if summary exists in cache
   * @param {string} gameId - Game ID
   * @returns {boolean} True if exists and not expired
   */
  has(gameId) {
    const cached = this.get(gameId);
    return cached !== null;
  }

  /**
   * Clear expired entries (cleanup)
   */
  cleanup() {
    const now = Date.now();
    for (const [gameId, cached] of this.cache.entries()) {
      if (now > cached.expiresAt) {
        this.cache.delete(gameId);
      }
    }
  }
}

module.exports = new GameSummaryCache();

