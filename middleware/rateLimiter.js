/**
 * Rate Limiting Middleware
 * Prevents API abuse and ensures fair usage
 */

// Simple in-memory rate limiter (for production, consider Redis)
class RateLimiter {
  constructor() {
    this.requests = new Map(); // Map<ip, {count, resetTime}>
    this.cleanupInterval = null;
  }

  /**
   * Clean up old entries periodically
   */
  startCleanup() {
    if (this.cleanupInterval) return;
    
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [ip, data] of this.requests.entries()) {
        if (now > data.resetTime) {
          this.requests.delete(ip);
        }
      }
    }, 60000); // Clean up every minute
  }

  /**
   * Check if request should be rate limited
   * @param {string} ip - Client IP address
   * @param {number} maxRequests - Maximum requests per window
   * @param {number} windowMs - Time window in milliseconds
   * @returns {Object} { allowed: boolean, remaining: number, resetTime: number }
   */
  checkLimit(ip, maxRequests, windowMs) {
    const now = Date.now();
    const record = this.requests.get(ip);

    if (!record || now > record.resetTime) {
      // New window or expired window
      this.requests.set(ip, {
        count: 1,
        resetTime: now + windowMs
      });
      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetTime: now + windowMs
      };
    }

    if (record.count >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: record.resetTime
      };
    }

    // Increment count
    record.count++;
    return {
      allowed: true,
      remaining: maxRequests - record.count,
      resetTime: record.resetTime
    };
  }
}

const rateLimiter = new RateLimiter();
rateLimiter.startCleanup();

/**
 * Get client IP address from request
 */
const getClientIP = (req) => {
  return req.ip || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress ||
         req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         'unknown';
};

/**
 * Create rate limit middleware
 * @param {Object} options - Rate limit options
 * @param {number} options.maxRequests - Maximum requests per window (default: 100)
 * @param {number} options.windowMs - Time window in milliseconds (default: 15 minutes)
 * @param {string} options.message - Custom error message
 * @returns {Function} Express middleware
 */
const createRateLimiter = (options = {}) => {
  const {
    maxRequests = 180,
    windowMs = 15 * 60 * 1000, // 15 minutes
    message = 'Too many requests, please try again later'
  } = options;

  return (req, res, next) => {
    const ip = getClientIP(req);
    const result = rateLimiter.checkLimit(ip, maxRequests, windowMs);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

    if (!result.allowed) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message,
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000) // seconds
        },
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
};

/**
 * Standard rate limiter (100 requests per 15 minutes)
 */
const standardRateLimiter = createRateLimiter({
  maxRequests: 100,
  windowMs: 15 * 60 * 1000
});

/**
 * Strict rate limiter for expensive operations (20 requests per 15 minutes)
 */
const strictRateLimiter = createRateLimiter({
  maxRequests: 20,
  windowMs: 15 * 60 * 1000,
  message: 'Too many requests for this resource, please try again later'
});

module.exports = {
  createRateLimiter,
  standardRateLimiter,
  strictRateLimiter
};

