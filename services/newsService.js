/**
 * News Service
 * Scrapes NBA news from Twitter/X using Nitter (privacy-focused Twitter frontend)
 * Nitter instances: https://github.com/zedeus/nitter/wiki/Instances
 */

const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const dateFormatter = require('../utils/dateFormatter');

class NewsService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes cache
    this.browser = null;
    this.fetchingPromise = null; // Lock to prevent concurrent requests
    
    // List of Nitter instances to try (in order of preference)
    // Based on: https://github.com/zedeus/nitter/wiki/Instances
    // Instances marked with * require Puppeteer due to bot protection
    this.nitterInstances = [
      { url: 'https://nitter.net', usePuppeteer: false }, // Official instance
      { url: 'https://xcancel.com', usePuppeteer: false },
      { url: 'https://nitter.poast.org', usePuppeteer: false },
      { url: 'https://nitter.privacyredirect.com', usePuppeteer: true }, // Has Anubis bot protection
      { url: 'https://nitter.space', usePuppeteer: false },
      { url: 'https://nitter.tiekoetter.com', usePuppeteer: false }
    ];
    this.currentInstanceIndex = 0;
    
    // List of NBA news Twitter accounts to fetch from
    this.nbaNewsAccounts = [
      { username: 'ShamsCharania', author: 'Shams Charania', handle: '@ShamsCharania' },
      { username: 'AnthonySlater', author: 'Anthony Slater', handle: '@anthonyVslater' },
      { username: 'TheSteinLine', author: 'Marc Stein', handle: '@TheSteinLine' },
      { username: 'ChrisBHaynes', author: 'Chris Haynes', handle: '@ChrisBHaynes' }
    ];
  }

  /**
   * Get or create browser instance for Puppeteer
   * @returns {Promise<Browser>} Puppeteer browser instance
   */
  async getBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ]
      });
    }
    return this.browser;
  }

  /**
   * Get the current Nitter instance config
   * @returns {Object} Nitter instance config with url and usePuppeteer
   */
  getCurrentInstance() {
    return this.nitterInstances[this.currentInstanceIndex];
  }

  /**
   * Try the next Nitter instance if current one fails
   */
  rotateInstance() {
    this.currentInstanceIndex = (this.currentInstanceIndex + 1) % this.nitterInstances.length;
    const instance = this.getCurrentInstance();
    console.log(`Switching to Nitter instance: ${instance.url} (Puppeteer: ${instance.usePuppeteer})`);
  }

  /**
   * Check if the HTML response indicates bot protection
   * @param {string} html - HTML content
   * @returns {boolean} True if bot protection detected
   */
  hasBotProtection(html) {
    return html.includes('Making sure you\'re not a bot') ||
           html.includes('Anubis') ||
           html.includes('Cloudflare') ||
           html.includes('challenge-platform') ||
           html.includes('cf-browser-verification');
  }

  /**
   * Parse timestamp from Nitter date string
   * @param {string} timeStr - Time string from Nitter
   * @returns {Date|null} Parsed date or null if invalid
   */
  parseTimestamp(timeStr) {
    if (!timeStr) return null;
    
    try {
      // Try parsing as ISO date string
      const date = new Date(timeStr);
      if (!isNaN(date.getTime())) {
        return date;
      }
      
      // Try parsing common Nitter date formats
      // Format: "Dec 12, 2024 · 9:00 AM UTC"
      const dateMatch = timeStr.match(/(\w{3})\s+(\d{1,2}),\s+(\d{4})/);
      if (dateMatch) {
        const [, month, day, year] = dateMatch;
        const monthMap = {
          'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
          'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
        };
        const monthIndex = monthMap[month];
        if (monthIndex !== undefined) {
          return new Date(year, monthIndex, parseInt(day));
        }
      }
      
      return null;
    } catch (error) {
      console.warn(`Failed to parse timestamp: ${timeStr}`, error.message);
      return null;
    }
  }

  /**
   * Extract tweets from HTML using cheerio
   * @param {string} html - HTML content
   * @param {string} nitterUrl - Base URL of Nitter instance
   * @returns {Array} Array of tweet objects
   */
  extractTweetsFromHTML(html, nitterUrl) {
    const $ = cheerio.load(html);
    const tweets = [];
    const seenTexts = new Set();

    // Extract tweets from Nitter's timeline-item structure
    $('div.timeline-item').each((_, el) => {
      const text = $(el).find('.tweet-content').text().trim();
      const time = $(el).find('span.tweet-date > a').attr('title');
      const link = $(el).find('span.tweet-date > a').attr('href');
      const fullLink = link ? `https://x.com${link}` : null;

      // Extract avatar from tweet header
      // Nitter structure: .tweet-header > .tweet-avatar > img or .avatar
      let avatarUrl = null;
      const avatarImg = $(el).find('.tweet-avatar img, .avatar').first();
      if (avatarImg.length > 0) {
        const avatarSrc = avatarImg.attr('src');
        if (avatarSrc) {
          avatarUrl = avatarSrc.startsWith('http') 
            ? avatarSrc 
            : `${nitterUrl}${avatarSrc}`;
        }
      }

      // Extract images from the tweet
      // Structure: <a class="still-image" href="/pic/orig/..."> <img src="/pic/media/...?name=small"> </a>
      // We use img src for display (thumbnail) and href for link (full-size image)
      const images = [];
      const imageLinks = []; // Links to full-size images
      
      // Method 1: Look for images in attachments (most reliable for Nitter)
      // Nitter structure: .attachments > .gallery-row > .attachment.image > a.still-image > img
      $(el).find('.attachments .attachment.image').each((_, attachment) => {
        const link = $(attachment).find('a.still-image');
        const img = $(attachment).find('img');
        
        // Get thumbnail src from img tag (for display)
        const imgSrc = img.attr('src');
        if (imgSrc && imgSrc.includes('/pic/')) {
          const thumbnailUrl = imgSrc.startsWith('http') 
            ? imgSrc 
            : `${nitterUrl}${imgSrc}`;
          if (!images.includes(thumbnailUrl)) {
            images.push(thumbnailUrl);
          }
        }
        
        // Get full-size link from a tag href (for clicking)
        const linkHref = link.attr('href');
        if (linkHref && linkHref.includes('/pic/')) {
          const fullSizeUrl = linkHref.startsWith('http') 
            ? linkHref 
            : `${nitterUrl}${linkHref}`;
          if (!imageLinks.includes(fullSizeUrl)) {
            imageLinks.push(fullSizeUrl);
          }
        }
      });

      // Method 2: Fallback - if no attachment structure found, use img src directly
      if (images.length === 0) {
        $(el).find('.attachments img').each((_, img) => {
          const src = $(img).attr('src');
          if (src && 
              src.includes('/pic/') &&
              !src.includes('avatar') && 
              !src.includes('emoji') &&
              !src.includes('data:image/svg')) {
            const imageUrl = src.startsWith('http') 
              ? src 
              : `${nitterUrl}${src}`;
            if (!images.includes(imageUrl)) {
              images.push(imageUrl);
            }
          }
        });
      }

      // Method 3: Check for tweet-media containers (alternative structure)
      $(el).find('.tweet-media img').each((_, img) => {
        const src = $(img).attr('src');
        if (src && 
            !src.includes('avatar') && 
            !src.includes('emoji') &&
            !src.includes('data:image/svg')) {
          const imageUrl = src.startsWith('http') 
            ? src 
            : `${nitterUrl}${src}`;
          if (!images.includes(imageUrl)) {
            images.push(imageUrl);
          }
        }
      });

      if (text && text.length > 0 && !seenTexts.has(text)) {
        seenTexts.add(text);
        tweets.push({
          text: text,
          time: time,
          link: fullLink,
          avatar: avatarUrl || undefined, // Avatar URL
          images: images,
          imageLinks: imageLinks.length > 0 ? imageLinks : undefined // Full-size image links
        });
      }
    });

    return tweets;
  }

  /**
   * Get tweets from Shams Charania's Twitter/X account using Nitter
   * @param {boolean} forceRefresh - If true, bypass cache and fetch fresh data
   * @returns {Promise<Array>} Array of tweet objects
   */
  async getShamsTweets(forceRefresh = false) {
    const cacheKey = 'shams_tweets';
    const cached = this.cache.get(cacheKey);
    
    // Return cached data if available and not forcing refresh
    if (!forceRefresh && cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      console.log('Returning cached tweets');
      return cached.data;
    }

    // If cache expired but we have data, return stale data while fetching in background
    if (!forceRefresh && cached) {
      console.log('Cache expired, returning stale data while fetching fresh data in background');
      // Trigger background refresh without blocking
      this.refreshTweetsInBackground();
      return cached.data;
    }

    // Prevent concurrent requests - if one is already in progress, wait for it
    if (this.fetchingPromise) {
      console.log('Another request is already in progress, waiting for it...');
      return this.fetchingPromise;
    }

    // Create the fetching promise and store it
    this.fetchingPromise = this._fetchAllAccountsTweets();
    
    try {
      const result = await this.fetchingPromise;
      return result;
    } finally {
      // Clear the promise when done
      this.fetchingPromise = null;
    }
  }

  /**
   * Refresh tweets in background without blocking
   * @private
   */
  async refreshTweetsInBackground() {
    // Only refresh if not already fetching
    if (this.fetchingPromise) {
      return;
    }

    try {
      this.fetchingPromise = this._fetchAllAccountsTweets();
      await this.fetchingPromise;
    } catch (error) {
      console.error('Background tweet refresh failed:', error);
    } finally {
      this.fetchingPromise = null;
    }
  }

  /**
   * Fetch tweets from a specific Twitter account
   * @param {string} username - Twitter username (without @)
   * @param {string} author - Author display name
   * @param {string} handle - Twitter handle (with @)
   * @returns {Promise<Array>} Array of tweet objects
   */
  async _fetchAccountTweets(username, author, handle) {
    const maxRetries = this.nitterInstances.length;
    let lastError = null;

    // Try each Nitter instance until one works
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const instance = this.getCurrentInstance();
      const nitterUrl = instance.url;
      const url = `${nitterUrl}/${username}`;
      
      try {
        console.log(`Attempting to fetch tweets from ${url} (Puppeteer: ${instance.usePuppeteer})...`);
        
        let html = '';
        
        if (instance.usePuppeteer) {
          // Use Puppeteer for instances with bot protection
          // These take longer, so we use a longer timeout
          console.log(`Using Puppeteer for ${nitterUrl} - this may take up to 60 seconds...`);
          const browser = await this.getBrowser();
          const page = await browser.newPage();
          
          try {
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            // Longer timeout for bot protection
            await page.goto(url, {
              waitUntil: 'networkidle2',
              timeout: 60000 // 60 seconds for bot protection
            });
            
            // Wait for tweets to load (or bot protection to pass)
            try {
              await page.waitForSelector('div.timeline-item', { timeout: 40000 });
              console.log(`Tweets found on ${nitterUrl}`);
            } catch (waitError) {
              console.log(`Initial wait failed, checking for bot protection...`);
              // Check if we're stuck on bot protection
              const pageContent = await page.content();
              if (this.hasBotProtection(pageContent)) {
                console.warn('Bot protection detected, waiting up to 20 seconds for it to pass...');
                // Wait longer for bot protection to pass
                await new Promise(resolve => setTimeout(resolve, 10000));
                // Try waiting again with longer timeout
                try {
                  await page.waitForSelector('div.timeline-item', { timeout: 40000 });
                  console.log(`Tweets loaded after bot protection passed`);
                } catch (retryError) {
                  // If still failing, check if page has any content
                  const finalContent = await page.content();
                  if (this.hasBotProtection(finalContent)) {
                    throw new Error('Bot protection not bypassed after waiting');
                  }
                  // Check for alternative selectors
                  const hasTweets = await page.evaluate(() => {
                    return document.querySelectorAll('div.timeline-item').length > 0 ||
                           document.querySelectorAll('article').length > 0 ||
                           document.querySelectorAll('.tweet-content').length > 0;
                  });
                  if (!hasTweets) {
                    throw new Error('No tweets found on page after waiting');
                  }
                  console.log(`Tweets found using alternative selectors`);
                }
              } else {
                // Maybe tweets are loading differently, check for alternative selectors
                const hasTweets = await page.evaluate(() => {
                  return document.querySelectorAll('div.timeline-item').length > 0 ||
                         document.querySelectorAll('article').length > 0 ||
                         document.querySelectorAll('.tweet-content').length > 0;
                });
                if (!hasTweets) {
                  throw new Error('No tweets found on page');
                }
                console.log(`Tweets found using alternative selectors`);
              }
            }
            
            html = await page.content();
          } catch (puppeteerError) {
            console.error(`Puppeteer error for ${nitterUrl}:`, puppeteerError.message);
            await page.close().catch(() => {});
            throw puppeteerError;
          } finally {
            try {
              await page.close();
            } catch (closeError) {
              // Ignore close errors
            }
          }
        } else {
          // Use axios for instances without bot protection
          const res = await axios.get(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Referer': nitterUrl
            },
            timeout: 15000
          });
          
          html = res.data;
          
          // Check if bot protection was triggered even though we didn't expect it
          if (this.hasBotProtection(html)) {
            console.warn('Bot protection detected on instance that should not have it, switching to Puppeteer...');
            // Retry with Puppeteer
            const browser = await this.getBrowser();
            const page = await browser.newPage();
            try {
              await page.setViewport({ width: 1920, height: 1080 });
              await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
              await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
              await page.waitForSelector('div.timeline-item', { timeout: 20000 });
              html = await page.content();
            } finally {
              await page.close();
            }
          }
        }

        // Extract tweets from HTML
        const tweets = this.extractTweetsFromHTML(html, nitterUrl);

        if (tweets.length > 0) {
          // Format tweets as objects
          const formattedTweets = tweets
            .slice(0, 10) // Latest 10 tweets
            .map((tweet, index) => {
              let timestamp;
              try {
                const parsedDate = this.parseTimestamp(tweet.time);
                if (parsedDate && !isNaN(parsedDate.getTime())) {
                  timestamp = parsedDate.toISOString();
                } else {
                  timestamp = new Date().toISOString();
                }
              } catch (dateError) {
                console.warn(`Error parsing timestamp for tweet ${index}:`, dateError.message);
                timestamp = new Date().toISOString();
              }
              
              // Format timestamp for display (Chinese locale by default)
              const timestampFormatted = dateFormatter.formatNewsTimestamp(
                timestamp, 
                { locale: 'zh-CN', timezone: 'Asia/Shanghai' }
              );
              
              return {
                id: `${username}_${Date.now()}_${index}`,
                author: author,
                authorHandle: handle,
                avatar: tweet.avatar, // Avatar URL
                text: tweet.text,
                images: tweet.images || [],
                imageLinks: tweet.imageLinks || [], // Full-size image links
                link: tweet.link,
                timestamp: timestamp, // Keep ISO for backward compatibility
                timestampFormatted: timestampFormatted // Formatted timestamp for display
              };
            });

          console.log(`Successfully extracted ${formattedTweets.length} tweets from ${username} via ${nitterUrl}`);
          return formattedTweets;
        } else {
          throw new Error('No tweets found on page');
        }
      } catch (error) {
        console.error(`Error fetching from ${nitterUrl}:`, error.message);
        lastError = error;
        
        // Try next instance
        if (attempt < maxRetries - 1) {
          this.rotateInstance();
        }
      }
    }

    // All instances failed for this account
    console.error(`All Nitter instances failed for ${username} after trying all options.`);
    console.error('Last error:', lastError?.message);
    return []; // Return empty array, will be handled by caller
  }

  /**
   * Fetch tweets from all NBA news accounts and combine them
   * @returns {Promise<Array>} Combined array of tweet objects from all accounts
   */
  async _fetchAllAccountsTweets() {
    const cacheKey = 'nba_news_tweets';
    const allTweets = [];
    
    console.log(`Fetching tweets from ${this.nbaNewsAccounts.length} NBA news accounts...`);
    
    // Fetch from all accounts in parallel (with concurrency limit)
    const batchSize = 2; // Process 2 accounts at a time to avoid overwhelming Nitter
    for (let i = 0; i < this.nbaNewsAccounts.length; i += batchSize) {
      const batch = this.nbaNewsAccounts.slice(i, i + batchSize);
      
      const batchResults = await Promise.allSettled(
        batch.map(async (account) => {
          try {
            const tweets = await this._fetchAccountTweets(
              account.username,
              account.author,
              account.handle
            );
            return tweets;
          } catch (error) {
            console.error(`Error fetching tweets from ${account.username}:`, error.message);
            return [];
          }
        })
      );
      
      // Collect successful results
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
          allTweets.push(...result.value);
        } else {
          console.warn(`Failed to fetch from ${batch[index].username}`);
        }
      });
      
      // Small delay between batches
      if (i + batchSize < this.nbaNewsAccounts.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Sort all tweets by timestamp (newest first)
    allTweets.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA;
    });
    
    // Limit to latest 30 tweets total
    const limitedTweets = allTweets.slice(0, 30);
    
    // Cache the response
    this.cache.set(cacheKey, {
      data: limitedTweets,
      timestamp: Date.now()
    });
    
    console.log(`Successfully fetched ${limitedTweets.length} tweets from ${this.nbaNewsAccounts.length} accounts`);
    return limitedTweets;
  }

  /**
   * Cleanup browser instance
   */
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Get mock tweets for demonstration when scraping fails
   * @returns {Array} Array of mock tweet objects
   */
  getMockTweets() {
    return [
      {
        id: 'mock_1',
        author: 'Shams Charania',
        authorHandle: '@ShamsCharania',
        text: 'Breaking: Multiple teams showing interest in trade discussions ahead of deadline.',
        images: [],
        timestamp: new Date().toISOString()
      },
      {
        id: 'mock_2',
        author: 'Marc Stein',
        authorHandle: '@TheSteinLine',
        text: 'Injury update: Player Z is expected to return to action next week after missing time.',
        images: [],
        timestamp: new Date(Date.now() - 7200000).toISOString()
      },
      {
        id: 'mock_3',
        author: 'Chris Haynes',
        authorHandle: '@ChrisBHaynes',
        text: 'Latest trade rumors and updates from around the league.',
        images: [],
        timestamp: new Date(Date.now() - 10800000).toISOString()
      }
    ];
  }
}

module.exports = new NewsService();

