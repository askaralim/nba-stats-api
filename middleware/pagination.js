/**
 * Pagination Middleware and Utilities
 * Ensures mobile-safe pagination across all list endpoints
 */

/**
 * Parse and validate pagination parameters
 * @param {Object} req - Express request object
 * @returns {Object} Pagination options
 */
const parsePagination = (req) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20; // Mobile-friendly default
  
  // Validate and clamp values
  const validatedPage = Math.max(1, page);
  const validatedLimit = Math.min(Math.max(1, limit), 100); // Max 100
  
  return {
    page: validatedPage,
    limit: validatedLimit,
    offset: (validatedPage - 1) * validatedLimit
  };
};

/**
 * Create pagination metadata
 * @param {Object} options - Pagination options
 * @param {number} total - Total number of items
 * @returns {Object} Pagination metadata
 */
const createPaginationMeta = (options, total) => {
  const { page, limit } = options;
  const totalPages = Math.ceil(total / limit);
  
  return {
    page,
    limit,
    total,
    totalPages,
    hasMore: page < totalPages,
    nextPage: page < totalPages ? page + 1 : null,
    prevPage: page > 1 ? page - 1 : null
  };
};

/**
 * Paginate array data
 * @param {Array} data - Array to paginate
 * @param {Object} pagination - Pagination options { page, limit, offset }
 * @returns {Object} Paginated result with data and metadata
 */
const paginateArray = (data, pagination) => {
  const { offset, limit } = pagination;
  const total = data.length;
  const paginatedData = data.slice(offset, offset + limit);
  
  return {
    data: paginatedData,
    meta: {
      pagination: createPaginationMeta(pagination, total)
    }
  };
};

/**
 * Middleware to add pagination to response
 * Adds pagination metadata to res.locals for use in route handlers
 */
const paginationMiddleware = (req, res, next) => {
  const pagination = parsePagination(req);
  req.pagination = pagination;
  res.locals.pagination = pagination;
  next();
};

module.exports = {
  parsePagination,
  createPaginationMeta,
  paginateArray,
  paginationMiddleware
};

