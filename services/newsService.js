/**
 * News Service
 * Scrapes NBA news from Twitter/X using Nitter (privacy-focused Twitter frontend)
 * Nitter instances: https://github.com/zedeus/nitter/wiki/Instances
 */

const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

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
   * @returns {Promise<Array>} Array of tweet objects
   */
  async getShamsTweets() {
    const cacheKey = 'shams_tweets';
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      console.log('Returning cached tweets');
      return cached.data;
    }

    // Prevent concurrent requests - if one is already in progress, wait for it
    if (this.fetchingPromise) {
      console.log('Another request is already in progress, waiting for it...');
      return this.fetchingPromise;
    }

    // Create the fetching promise and store it
    this.fetchingPromise = this._fetchShamsTweets();
    
    try {
      const result = await this.fetchingPromise;
      return result;
    } finally {
      // Clear the promise when done
      this.fetchingPromise = null;
    }
  }

  /**
   * Internal method to fetch tweets (actual implementation)
   * @private
   * @returns {Promise<Array>} Array of tweet objects
   */
  async _fetchShamsTweets() {
    const cacheKey = 'shams_tweets';
    const maxRetries = this.nitterInstances.length;
    let lastError = null;

    // Try each Nitter instance until one works
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const instance = this.getCurrentInstance();
      const nitterUrl = instance.url;
      const url = `${nitterUrl}/ShamsCharania`;
      
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
              
              return {
                id: `shams_${Date.now()}_${index}`,
                author: 'Shams Charania',
                authorHandle: '@ShamsCharania',
                avatar: tweet.avatar, // Avatar URL
                text: tweet.text,
                images: tweet.images || [],
                imageLinks: tweet.imageLinks || [], // Full-size image links
                link: tweet.link,
                timestamp: timestamp
              };
            });

          // Cache the response
          this.cache.set(cacheKey, {
            data: formattedTweets,
            timestamp: Date.now()
          });

          console.log(`Successfully extracted ${formattedTweets.length} tweets from ${nitterUrl}`);
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

    // All instances failed, return mock data
    console.error('All Nitter instances failed after trying all options. Returning mock data.');
    console.error('Last error:', lastError?.message);
    console.error('Note: If you see this but also see a success message, there may be concurrent requests.');
    return this.getMockTweets();
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
        author: 'Shams Charania',
        authorHandle: '@ShamsCharania',
        text: 'Sources: Player X and Team Y are in discussions on a potential contract extension.',
        images: [],
        timestamp: new Date(Date.now() - 3600000).toISOString()
      },
      {
        id: 'mock_3',
        author: 'Shams Charania',
        authorHandle: '@ShamsCharania',
        text: 'Injury update: Player Z is expected to return to action next week after missing time.',
        images: [],
        timestamp: new Date(Date.now() - 7200000).toISOString()
      }
    ];
  }
}

module.exports = new NewsService();

