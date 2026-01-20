/**
 * Performance Monitoring Middleware
 * Tracks response times and logs slow requests
 */

/**
 * Response time tracking middleware
 * Adds X-Response-Time header and logs slow requests
 */
const performanceMiddleware = (req, res, next) => {
  const startTime = Date.now();
  
  // Override res.end to capture response time
  const originalEnd = res.end;
  res.end = function(...args) {
    const responseTime = Date.now() - startTime;
    
    // Add response time header
    res.setHeader('X-Response-Time', `${responseTime}ms`);
    
    // Log slow requests (> 500ms)
    if (responseTime > 500) {
      console.warn(`[Performance] Slow request detected:`, {
        method: req.method,
        path: req.path,
        responseTime: `${responseTime}ms`,
        statusCode: res.statusCode
      });
    }
    
    // Call original end
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

