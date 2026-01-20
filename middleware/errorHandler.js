/**
 * Standardized Error Handler Middleware
 * Provides consistent error responses for API endpoints
 */

/**
 * Custom error classes for better error handling
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class ExternalAPIError extends AppError {
  constructor(message, statusCode = 502, details = null) {
    super(message, statusCode, 'EXTERNAL_API_ERROR', details);
  }
}

class TimeoutError extends AppError {
  constructor(message = 'Request timeout', details = null) {
    super(message, 504, 'TIMEOUT_ERROR', details);
  }
}

/**
 * Standardized API response wrapper
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {string} message - Optional success message
 * @param {number} statusCode - HTTP status code (default: 200)
 * @param {Object} options - Additional options (pagination, version, etc.)
 */
const sendSuccess = (res, data, message = null, statusCode = 200, options = {}) => {
  const response = {
    success: true,
    data,
    ...(message && { message }),
    timestamp: new Date().toISOString(),
    meta: {
      version: options.version || 'v1',
      ...(res.locals?.requestId && { requestId: res.locals.requestId }),
      ...(options.pagination && { pagination: options.pagination })
    }
  };
  
  // Set version header
  res.setHeader('X-API-Version', options.version || 'v1');
  
  return res.status(statusCode).json(response);
};

/**
 * Standardized error response
 * @param {Object} res - Express response object
 * @param {Error|AppError} error - Error object
 */
const sendError = (res, error) => {
  // Handle known operational errors
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details && { details: error.details })
      },
      timestamp: new Date().toISOString()
    });
  }

  // Handle validation errors from express-validator
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message || 'Invalid input',
        ...(error.errors && { details: error.errors })
      },
      timestamp: new Date().toISOString()
    });
  }

  // Handle unknown errors (don't expose internal details in production)
  const statusCode = error.statusCode || 500;
  const isDevelopment = process.env.NODE_ENV === 'development';

  return res.status(statusCode).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: isDevelopment ? error.message : 'An unexpected error occurred',
      ...(isDevelopment && { stack: error.stack })
    },
    timestamp: new Date().toISOString()
  });
};

/**
 * Global error handler middleware
 * Should be used as the last middleware in Express app
 */
const errorHandler = (err, req, res, next) => {
  // Skip logging for favicon requests (browsers auto-request this)
  if (req.path === '/favicon.ico') {
    return res.status(204).end();
  }
  
  // Log error for debugging
  console.error('[Error Handler]', {
    path: req.path,
    method: req.method,
    error: {
      message: err.message,
      code: err.code,
      statusCode: err.statusCode,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }
  });

  sendError(res, err);
};

/**
 * Async handler wrapper to catch errors in async route handlers
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped function
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 handler for undefined routes
 */
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`Route ${req.method} ${req.path}`);
  next(error);
};

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  ExternalAPIError,
  TimeoutError,
  sendSuccess,
  sendError,
  errorHandler,
  asyncHandler,
  notFoundHandler
};

