/**
 * Response Cache Service
 * Generic, reusable cache for API endpoint responses to reduce processing overhead
 * 
 * Usage Examples:
 * 
 * // Basic usage with default 5-minute TTL
 * const responseCache = require('./services/responseCache');
 * const cacheKey = `endpoint_${param}`;
 * const cached = responseCache.get(cacheKey);
 * if (cached) return cached;
 * 
 * // ... process request ...
 * 
 * responseCache.set(cacheKey, responseData);
 * 
 * // Custom TTL (e.g., 1 minute for live data)
 * responseCache.set(cacheKey, responseData, 60 * 1000);
 * 
 * // Custom TTL when getting (e.g., 30 seconds)
 * const cached = responseCache.get(cacheKey, 30 * 1000);
 * 
 * // Check if exists without getting
 * if (responseCache.has(cacheKey)) { ... }
 * 
 * // Delete specific entry
 * responseCache.delete(cacheKey);
 * 
 * // Clear all cache
 * responseCache.clear();
 */

class ResponseCache {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Get cached response for a key
   * @param {string} key - Cache key (e.g., endpoint path + params)
   * @param {number} ttlMs - Time to live in milliseconds
   * @returns {Object|null} Cached response or null if expired/not found
   */
  get(key, ttlMs = 300000) { // Default 5 minutes
    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }

    // Check if expired
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * Store response in cache
   * @param {string} key - Cache key
   * @param {Object} data - Response data to cache
   * @param {number} ttlMs - Time to live in milliseconds
   */
  set(key, data, ttlMs = 300000) {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs
    });
  }

  /**
   * Check if key exists and is not expired
   * @param {string} key - Cache key
   * @param {number} ttlMs - Time to live in milliseconds
   * @returns {boolean} True if exists and not expired
   */
  has(key, ttlMs = 300000) {
    const cached = this.get(key, ttlMs);
    return cached !== null;
  }

  /**
   * Delete a specific cache entry
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Clear all expired entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, cached] of this.cache.entries()) {
      if (now > cached.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
  }
}

module.exports = new ResponseCache();
