/**
 * Retry Utility for Transient Failures
 * Implements exponential backoff retry logic for API calls
 */

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.initialDelay - Initial delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 10000)
 * @param {number} options.backoffMultiplier - Backoff multiplier (default: 2)
 * @param {Function} options.shouldRetry - Function to determine if error should be retried
 * @returns {Promise} Result of the function
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    shouldRetry = (error) => {
      // Retry on network errors, timeouts, and 5xx errors
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        return true;
      }
      if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
        return true;
      }
      if (error.response?.status >= 500 && error.response?.status < 600) {
        return true;
      }
      return false;
    }
  } = options;

  let lastError;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if we've exhausted retries
      if (attempt >= maxRetries) {
        break;
      }

      // Don't retry if error is not retryable
      if (!shouldRetry(error)) {
        throw error;
      }

      // Log retry attempt
      console.warn(`[Retry] Attempt ${attempt + 1}/${maxRetries} failed:`, {
        error: error.message,
        retryingIn: `${delay}ms`
      });

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));

      // Calculate next delay with exponential backoff
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  // All retries exhausted
  throw lastError;
}

/**
 * Create a retry wrapper for fetch requests
 * @param {string} url - URL to fetch
 * @param {Object} fetchOptions - Fetch options
 * @param {Object} retryOptions - Retry options
 * @returns {Promise<Response>} Fetch response
 */
async function fetchWithRetry(url, fetchOptions = {}, retryOptions = {}) {
  return retryWithBackoff(async () => {
    const controller = new AbortController();
    const timeout = fetchOptions.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok && response.status >= 500) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }, retryOptions);
}

module.exports = {
  retryWithBackoff,
  fetchWithRetry
};

