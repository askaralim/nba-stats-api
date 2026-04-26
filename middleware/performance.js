/**
 * Performance Monitoring Middleware
 * Tracks response times and logs slow requests
 */

const logger = require('../utils/logger');

/**
 * Response time tracking middleware
 * Adds X-Response-Time header and logs slow requests
 */
const performanceMiddleware = (req, res, next) => {
  const startTime = Date.now();

  const originalEnd = res.end;
  res.end = function (...args) {
    const responseTime = Date.now() - startTime;
    res.setHeader('X-Response-Time', `${responseTime}ms`);

    if (responseTime > 500) {
      const log = req.log || logger;
      log.warn(
        {
          component: 'performance',
          method: req.method,
          path: req.path,
          responseTimeMs: responseTime,
          statusCode: res.statusCode,
        },
        'Slow request',
      );
    }

    originalEnd.apply(this, args);
  };

  next();
};

/**
 * Request ID middleware for tracking
 */
const requestIdMiddleware = (req, res, next) => {
  // Generate simple request ID (timestamp + random)
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  req.requestId = requestId;
  res.requestId = requestId;
  res.locals = res.locals || {};
  res.locals.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
};

module.exports = {
  performanceMiddleware,
  requestIdMiddleware
};

