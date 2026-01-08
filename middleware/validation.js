/**
 * Input Validation Middleware
 * Validates request parameters, query strings, and body
 */

const { ValidationError } = require('./errorHandler');

/**
 * Validate gameId parameter
 */
const validateGameId = (req, res, next) => {
  const { gameId } = req.params;
  
  if (!gameId) {
    return next(new ValidationError('gameId parameter is required'));
  }
  
  // ESPN game IDs are typically numeric strings
  if (!/^\d+$/.test(gameId)) {
    return next(new ValidationError('gameId must be a numeric string'));
  }
  
  next();
};

/**
 * Validate date parameter (YYYYMMDD format)
 */
const validateDate = (req, res, next) => {
  const { date } = req.query;
  
  if (!date) {
    return next(); // Date is optional, defaults to today
  }
  
  if (!/^\d{8}$/.test(date)) {
    return next(new ValidationError('Date must be in YYYYMMDD format'));
  }
  
  // Validate date is reasonable (not too far in past/future)
  const year = parseInt(date.substring(0, 4));
  const month = parseInt(date.substring(4, 6));
  const day = parseInt(date.substring(6, 8));
  
  const dateObj = new Date(year, month - 1, day);
  if (dateObj.getFullYear() !== year || 
      dateObj.getMonth() !== month - 1 || 
      dateObj.getDate() !== day) {
    return next(new ValidationError('Invalid date'));
  }
  
  // Check date is within reasonable range (e.g., 2000-2100)
  if (year < 2000 || year > 2100) {
    return next(new ValidationError('Date must be between 2000 and 2100'));
  }
  
  next();
};

/**
 * Validate team abbreviation parameter
 */
const validateTeamAbbreviation = (req, res, next) => {
  const { teamAbbreviation } = req.params;
  
  if (!teamAbbreviation) {
    return next(new ValidationError('teamAbbreviation parameter is required'));
  }
  
  // Team abbreviations are 2-3 uppercase letters
  if (!/^[A-Z]{2,3}$/i.test(teamAbbreviation)) {
    return next(new ValidationError('teamAbbreviation must be 2-3 letters'));
  }
  
  next();
};

/**
 * Validate player ID parameter
 */
const validatePlayerId = (req, res, next) => {
  const { playerId } = req.params;
  
  if (!playerId) {
    return next(new ValidationError('playerId parameter is required'));
  }
  
  // Player IDs are typically numeric strings
  if (!/^\d+$/.test(playerId)) {
    return next(new ValidationError('playerId must be a numeric string'));
  }
  
  next();
};

/**
 * Validate pagination parameters
 */
const validatePagination = (req, res, next) => {
  const { page, limit } = req.query;
  
  if (page !== undefined) {
    const pageNum = parseInt(page);
    if (isNaN(pageNum) || pageNum < 1) {
      return next(new ValidationError('page must be a positive integer'));
    }
  }
  
  if (limit !== undefined) {
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return next(new ValidationError('limit must be between 1 and 100'));
    }
  }
  
  next();
};

/**
 * Validate filter parameters for games/today endpoint
 */
const validateGameFilters = (req, res, next) => {
  const { closeGames, overtime, marquee } = req.query;
  
  // These should be boolean strings ('true' or 'false') or undefined
  const booleanParams = { closeGames, overtime, marquee };
  
  for (const [key, value] of Object.entries(booleanParams)) {
    if (value !== undefined && value !== 'true' && value !== 'false') {
      return next(new ValidationError(`${key} must be 'true' or 'false'`));
    }
  }
  
  next();
};

module.exports = {
  validateGameId,
  validateDate,
  validateTeamAbbreviation,
  validatePlayerId,
  validatePagination,
  validateGameFilters
};

