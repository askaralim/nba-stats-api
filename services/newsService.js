/**
 * News Service
 * Scrapes NBA news from Twitter/X using Puppeteer
 */

const puppeteer = require('puppeteer');

class NewsService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes cache
    this.browser = null;
  }

  /**
   * Get or create browser instance
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
   * Get tweets from Shams Charania's Twitter/X account using Puppeteer
   * @returns {Promise<Array>} Array of tweet objects
   */
  async getShamsTweets() {
    const cacheKey = 'shams_tweets';
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    let page = null;
    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();
      
      // Set viewport and user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      const url = 'https://x.com/ShamsCharania';
      console.log(`Navigating to ${url}...`);
      
      // Navigate to the page
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for tweets to load
      console.log('Waiting for tweets to load...');
      try {
        // Wait for article elements (tweets) to appear
        await page.waitForSelector('article', { timeout: 15000 });
        
        // Additional wait for content to fully render
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (waitError) {
        console.warn('Timeout waiting for tweets, proceeding with available content...');
      }

      // Extract tweets from the page
      const tweets = await page.evaluate(() => {
        const tweetElements = document.querySelectorAll('article');
        const extractedTweets = [];
        const seenTexts = new Set();

        tweetElements.forEach((article) => {
          // Try multiple methods to extract tweet text
          let tweetText = '';
          let tweetImages = [];
          
          // Method 1: Look for div[data-testid="tweetText"]
          const tweetTextDiv = article.querySelector('div[data-testid="tweetText"]');
          if (tweetTextDiv) {
            tweetText = tweetTextDiv.innerText.trim();
          }
          
          // Method 2: If not found, try to get text from spans
          if (!tweetText || tweetText.length < 20) {
            const spans = article.querySelectorAll('span');
            const textParts = [];
            spans.forEach(span => {
              const text = span.innerText.trim();
              // Filter out handles, links, and very short text
              if (text.length > 10 && 
                  !text.startsWith('@') && 
                  !text.startsWith('http') &&
                  !text.includes('·') &&
                  !text.match(/^\d+[hms]$/)) {
                textParts.push(text);
              }
            });
            tweetText = textParts.join(' ').trim();
          }

          // Method 3: Fallback to getting all text from article
          if (!tweetText || tweetText.length < 20) {
            const allText = article.innerText;
            // Try to extract the main tweet text (usually the longest paragraph)
            const lines = allText.split('\n').filter(line => 
              line.trim().length > 20 && 
              !line.trim().startsWith('@') &&
              !line.trim().startsWith('http') &&
              !line.includes('Show this thread') &&
              !line.includes('Replying to')
            );
            if (lines.length > 0) {
              tweetText = lines[0].trim();
            }
          }

          // Extract images from the tweet
          // Method 1: Look for img tags within the article
          const images = article.querySelectorAll('img');
          images.forEach(img => {
            const src = img.src || img.getAttribute('src');
            if (src && 
                !src.includes('profile_images') && 
                !src.includes('emoji') &&
                !src.includes('data:image/svg') &&
                (src.startsWith('http') || src.startsWith('https'))) {
              // Check if it's a tweet image (usually contains 'pbs.twimg.com' or similar)
              if (src.includes('pbs.twimg.com') || src.includes('media')) {
                tweetImages.push(src);
              }
            }
          });

          // Method 2: Look for div[data-testid="tweetPhoto"] or similar containers
          const photoContainers = article.querySelectorAll('[data-testid*="Photo"], [data-testid*="image"]');
          photoContainers.forEach(container => {
            const img = container.querySelector('img');
            if (img) {
              const src = img.src || img.getAttribute('src');
              if (src && 
                  !src.includes('profile_images') && 
                  !src.includes('emoji') &&
                  !src.includes('data:image/svg') &&
                  (src.startsWith('http') || src.startsWith('https'))) {
                if (src.includes('pbs.twimg.com') || src.includes('media')) {
                  if (!tweetImages.includes(src)) {
                    tweetImages.push(src);
                  }
                }
              }
            }
          });

          // Remove duplicates from images array
          tweetImages = [...new Set(tweetImages)];

          // Add tweet if it's valid and not a duplicate
          if (tweetText && tweetText.length > 20 && !seenTexts.has(tweetText)) {
            seenTexts.add(tweetText);
            extractedTweets.push({
              text: tweetText,
              images: tweetImages
            });
          }
        });

        return extractedTweets;
      });

      // Format tweets as objects
      const formattedTweets = tweets
        .slice(0, 10) // Latest 10 tweets
        .map((tweet, index) => ({
          id: `shams_${Date.now()}_${index}`,
          author: 'Shams Charania',
          authorHandle: '@ShamsCharania',
          text: tweet.text || tweet, // Handle both object and string formats
          images: tweet.images || [],
          timestamp: new Date().toISOString()
        }));

      // Cache the response
      this.cache.set(cacheKey, {
        data: formattedTweets,
        timestamp: Date.now()
      });

      console.log(`Successfully extracted ${formattedTweets.length} tweets`);
      return formattedTweets;
    } catch (error) {
      console.error('Error fetching Shams tweets:', error.message);
      console.error('Error stack:', error.stack);
      
      // Return mock data on error
      return this.getMockTweets();
    } finally {
      // Close the page but keep the browser open for reuse
      if (page) {
        try {
          await page.close();
        } catch (closeError) {
          console.error('Error closing page:', closeError.message);
        }
      }
    }
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

