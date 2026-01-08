/**
 * CORS Configuration Middleware
 * Configures Cross-Origin Resource Sharing for web and mobile clients
 */

/**
 * Get allowed origins from environment or use defaults
 */
const getAllowedOrigins = () => {
  const corsOrigin = process.env.CORS_ORIGIN;
  
  if (!corsOrigin || corsOrigin === '*') {
    // Development: Allow all origins
    if (process.env.NODE_ENV === 'development') {
      return '*';
    }
    // Production: Use specific origins
    return [
      'http://localhost:5173', // Vite dev server
      'http://localhost:3000', // Alternative dev port
      process.env.WEB_APP_URL,
      process.env.MOBILE_APP_URL
    ].filter(Boolean);
  }
  
  // Parse comma-separated origins
  return corsOrigin.split(',').map(origin => origin.trim());
};

/**
 * CORS middleware with mobile app support
 */
const corsMiddleware = (req, res, next) => {
  const allowedOrigins = getAllowedOrigins();
  const origin = req.headers.origin;

  // Check if origin is allowed
  if (allowedOrigins === '*' || (Array.isArray(allowedOrigins) && allowedOrigins.includes(origin))) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }

  // Allow credentials for same-origin requests
  res.header('Access-Control-Allow-Credentials', 'true');

  // Allowed methods
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');

  // Allowed headers (including custom headers for mobile apps)
  res.header('Access-Control-Allow-Headers', [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-API-Key',
    'X-Client-Version', // For mobile app version tracking
    'X-Platform' // iOS, Android, Web
  ].join(', '));

  // Expose custom headers
  res.header('Access-Control-Expose-Headers', [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-ID'
  ].join(', '));

  // Cache preflight requests for 24 hours
  res.header('Access-Control-Max-Age', '86400');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
};

module.exports = corsMiddleware;

