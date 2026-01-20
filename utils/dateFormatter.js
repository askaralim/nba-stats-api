/**
 * Date Formatting Utilities
 * Centralized date formatting for consistent display across web and mobile platforms
 * Currently defaults to Chinese locale/timezone, but extensible for future locales
 */

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  locale: 'zh-CN',
  timezone: 'Asia/Shanghai',
  dateFormat: {
    date: { year: 'numeric', month: '2-digit', day: '2-digit' },
    time: { hour: '2-digit', minute: '2-digit', hour12: false },
    dateTime: { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false },
    weekday: { weekday: 'long' },
    shortDate: { month: 'short', day: 'numeric' },
    shortDateTime: { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }
  }
};

/**
 * Supported locales configuration
 * Easy to extend for future locales
 */
const LOCALE_CONFIGS = {
  'zh-CN': {
    locale: 'zh-CN',
    timezone: 'Asia/Shanghai',
    labels: {
      today: '今天',
      tomorrow: '明天',
      yesterday: '昨天',
      justNow: '刚刚',
      minutesAgo: '分钟前',
      hoursAgo: '小时前',
      daysAgo: '天前'
    }
  },
  'en-US': {
    locale: 'en-US',
    timezone: 'America/New_York',
    labels: {
      today: 'Today',
      tomorrow: 'Tomorrow',
      yesterday: 'Yesterday',
      justNow: 'Just now',
      minutesAgo: 'minutes ago',
      hoursAgo: 'hours ago',
      daysAgo: 'days ago'
    }
  }
};

/**
 * Get locale configuration
 * @param {string} locale - Locale code (default: 'zh-CN')
 * @returns {Object} Locale configuration
 */
function getLocaleConfig(locale = 'zh-CN') {
  return LOCALE_CONFIGS[locale] || LOCALE_CONFIGS['zh-CN'];
}

/**
 * Format date for display (localized)
 * @param {string|Date} date - ISO date string or Date object
 * @param {Object} options - Formatting options
 * @param {string} options.locale - Locale code (default: 'zh-CN')
 * @param {string} options.timezone - Timezone (default: 'Asia/Shanghai')
 * @returns {Object} Formatted date object
 */
function formatDateForDisplay(date, options = {}) {
  if (!date) return null;
  
  const config = getLocaleConfig(options.locale);
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) {
    return null;
  }
  
  const locale = options.locale || config.locale;
  const timezone = options.timezone || config.timezone;
  
  return {
    iso: dateObj.toISOString(),
    date: dateObj.toLocaleDateString(locale, { 
      ...DEFAULT_CONFIG.dateFormat.date,
      timeZone: timezone 
    }),
    time: dateObj.toLocaleTimeString(locale, { 
      ...DEFAULT_CONFIG.dateFormat.time,
      timeZone: timezone 
    }),
    dateTime: dateObj.toLocaleString(locale, { 
      ...DEFAULT_CONFIG.dateFormat.dateTime,
      timeZone: timezone 
    }),
    weekday: dateObj.toLocaleDateString(locale, { 
      ...DEFAULT_CONFIG.dateFormat.weekday,
      timeZone: timezone 
    }),
    shortDate: dateObj.toLocaleDateString(locale, { 
      ...DEFAULT_CONFIG.dateFormat.shortDate,
      timeZone: timezone 
    }),
    shortDateTime: dateObj.toLocaleString(locale, { 
      ...DEFAULT_CONFIG.dateFormat.shortDateTime,
      timeZone: timezone 
    }),
    relative: getRelativeTime(dateObj, config),
    timestamp: dateObj.getTime()
  };
}

/**
 * Get relative time string
 * @param {Date} date - Date object
 * @param {Object} config - Locale configuration
 * @returns {string} Relative time string
 */
function getRelativeTime(date, config = null) {
  if (!config) {
    config = getLocaleConfig();
  }
  
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.floor(Math.abs(diffMs) / 60000);
  const diffHours = Math.floor(Math.abs(diffMs) / 3600000);
  const diffDays = Math.floor(Math.abs(diffMs) / 86400000);
  
  // Future dates
  if (diffMs > 0) {
    if (diffMins < 1) return config.labels.justNow;
    if (diffMins < 60) return `${diffMins}${config.labels.minutesAgo}`;
    if (diffHours < 24) return `${diffHours}${config.labels.hoursAgo}`;
    if (diffDays === 0) return config.labels.today;
    if (diffDays === 1) return config.labels.tomorrow;
    if (diffDays < 7) return `${diffDays}${config.labels.daysAgo}`;
  }
  
  // Past dates
  if (diffMs < 0) {
    if (diffMins < 1) return config.labels.justNow;
    if (diffMins < 60) return `${diffMins}${config.labels.minutesAgo}`;
    if (diffHours < 24) return `${diffHours}${config.labels.hoursAgo}`;
    if (diffDays === 0) return config.labels.today;
    if (diffDays === 1) return config.labels.yesterday;
    if (diffDays < 7) return `${diffDays}${config.labels.daysAgo}`;
  }
  
  // Same day
  if (diffDays === 0) {
    return config.labels.today;
  }
  
  // Fallback to formatted date (avoid calling formatDateForDisplay to prevent circular dependency)
  const locale = config.locale || 'zh-CN';
  const timezone = config.timezone || 'Asia/Shanghai';
  return date.toLocaleDateString(locale, { 
    ...DEFAULT_CONFIG.dateFormat.date,
    timeZone: timezone 
  });
}

/**
 * Format game time for display
 * @param {string} gameEt - ISO date string
 * @param {Object} options - Formatting options
 * @returns {Object} Formatted game time
 */
function formatGameTimeForDisplay(gameEt, options = {}) {
  if (!gameEt) return null;
  
  const formatted = formatDateForDisplay(gameEt, options);
  if (!formatted) return null;
  
  return {
    iso: formatted.iso,
    time: formatted.time,
    date: formatted.shortDate,
    dateTime: formatted.shortDateTime,
    weekday: formatted.weekday,
    relative: formatted.relative,
    // Additional game-specific formats
    scheduled: formatted.dateTime, // Full date-time for scheduled games
    timestamp: formatted.timestamp
  };
}

/**
 * Format news timestamp for display
 * @param {string|Date} timestamp - ISO date string or Date object
 * @param {Object} options - Formatting options
 * @returns {Object} Formatted timestamp
 */
function formatNewsTimestamp(timestamp, options = {}) {
  if (!timestamp) return null;
  
  const formatted = formatDateForDisplay(timestamp, options);
  if (!formatted) return null;
  
  return {
    iso: formatted.iso,
    date: formatted.date,
    time: formatted.time,
    dateTime: formatted.dateTime,
    relative: formatted.relative,
    // News-specific: show date if not today, otherwise show relative time
    display: formatted.relative.includes(formatted.date.split(' ')[0]) 
      ? formatted.relative 
      : formatted.dateTime,
    timestamp: formatted.timestamp
  };
}

/**
 * Format schedule date for display
 * @param {string|Date} date - ISO date string or Date object
 * @param {Object} options - Formatting options
 * @returns {Object} Formatted schedule date
 */
function formatScheduleDate(date, options = {}) {
  if (!date) return null;
  
  const formatted = formatDateForDisplay(date, options);
  if (!formatted) return null;
  
  return {
    iso: formatted.iso,
    date: formatted.date,
    weekday: formatted.weekday,
    shortDate: formatted.shortDate,
    relative: formatted.relative,
    timestamp: formatted.timestamp
  };
}

/**
 * Convert Chinese date to API format (YYYYMMDD) for ESPN API
 * This maintains compatibility with existing API date conversion logic
 * @param {Date} chineseDate - Date in Chinese timezone
 * @returns {string} Date string in YYYYMMDD format for API
 */
function formatDateForAPI(chineseDate) {
  if (!chineseDate) {
    chineseDate = new Date();
  }
  
  const year = chineseDate.getFullYear();
  const month = chineseDate.getMonth() + 1;
  const day = chineseDate.getDate();
  
  const chineseDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const chineseMidnight = new Date(`${chineseDateStr}T00:00:00+08:00`);
  
  // Convert to US Eastern timezone (ESPN API uses Eastern time)
  const usEasternDateStr = chineseMidnight.toLocaleString('en-CA', { 
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const [usYear, usMonth, usDay] = usEasternDateStr.split('-');
  return `${usYear}${String(usMonth).padStart(2, '0')}${String(usDay).padStart(2, '0')}`;
}

/**
 * Get current date in specified timezone
 * @param {string} timezone - Timezone (default: 'Asia/Shanghai')
 * @returns {Date} Date object in specified timezone
 */
function getCurrentDateInTimezone(timezone = 'Asia/Shanghai') {
  const now = new Date();
  const dateStr = now.toLocaleString('en-CA', { timeZone: timezone }).split(',')[0];
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

module.exports = {
  formatDateForDisplay,
  formatGameTimeForDisplay,
  formatNewsTimestamp,
  formatScheduleDate,
  formatDateForAPI,
  getRelativeTime,
  getCurrentDateInTimezone,
  getLocaleConfig,
  LOCALE_CONFIGS,
  DEFAULT_CONFIG
};
