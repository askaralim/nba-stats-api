/**
 * News Service
 * Scrapes NBA news from Twitter/X using Nitter (privacy-focused Twitter frontend)
 * Nitter instances: https://github.com/zedeus/nitter/wiki/Instances
 */

const axios = require('axios');
const cheerio = require('cheerio');

class NewsService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes cache
    
    // List of Nitter instances to try (in order of preference)
    // Based on: https://github.com/zedeus/nitter/wiki/Instances
    this.nitterInstances = [
      'https://nitter.net', // Official instance
      'https://xcancel.com',
      'https://nitter.poast.org',
      'https://nitter.privacyredirect.com',
      'https://nitter.space',
      'https://nitter.tiekoetter.com'
    ];
    this.currentInstanceIndex = 0;
  }

  /**
   * Get the current Nitter instance URL
   * @returns {string} Nitter instance URL
   */
  getCurrentInstance() {
    return this.nitterInstances[this.currentInstanceIndex];
  }

  /**
   * Try the next Nitter instance if current one fails
   */
  rotateInstance() {
    this.currentInstanceIndex = (this.currentInstanceIndex + 1) % this.nitterInstances.length;
    console.log(`Switching to Nitter instance: ${this.getCurrentInstance()}`);
  }

  /**
   * Get tweets from Shams Charania's Twitter/X account using Nitter
   * @returns {Promise<Array>} Array of tweet objects
   */
  async getShamsTweets() {
    const cacheKey = 'shams_tweets';
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    const maxRetries = this.nitterInstances.length;
    let lastError = null;

    // Try each Nitter instance until one works
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const nitterUrl = this.getCurrentInstance();
      const url = `${nitterUrl}/ShamsCharania`;
      
      try {
        console.log(`Attempting to fetch tweets from ${url}...`);
        
        const res = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': nitterUrl
          },
          timeout: 15000 // 15 second timeout
        });

        const $ = cheerio.load(res.data);
        const tweets = [];
        const seenTexts = new Set();

        // Extract tweets from Nitter's timeline-item structure
        $('div.timeline-item').each((_, el) => {
          const text = $(el).find('.tweet-content').text().trim();
          const time = $(el).find('span.tweet-date > a').attr('title');
          const link = $(el).find('span.tweet-date > a').attr('href');
          const fullLink = link ? `https://x.com${link}` : null;

          // Extract images from the tweet
          const images = [];
          $(el).find('.tweet-body img').each((_, img) => {
            const src = $(img).attr('src');
            if (src && 
                !src.includes('avatar') && 
                !src.includes('emoji') &&
                !src.includes('data:image/svg') &&
                (src.startsWith('http') || src.startsWith('https'))) {
              // Nitter uses proxy URLs, convert to direct image URL if possible
              // Or use the Nitter proxy URL directly
              if (src.startsWith('http')) {
                images.push(src);
              } else if (src.startsWith('/')) {
                // Relative URL, make it absolute
                images.push(`${nitterUrl}${src}`);
              }
            }
          });

          // Also check for attached images in tweet-media containers
          $(el).find('.attachments img, .tweet-media img').each((_, img) => {
            const src = $(img).attr('src');
            if (src && 
                !src.includes('avatar') && 
                !src.includes('emoji') &&
                !src.includes('data:image/svg') &&
                (src.startsWith('http') || src.startsWith('https'))) {
              if (src.startsWith('http')) {
                if (!images.includes(src)) {
                  images.push(src);
                }
              } else if (src.startsWith('/')) {
                const absoluteUrl = `${nitterUrl}${src}`;
                if (!images.includes(absoluteUrl)) {
                  images.push(absoluteUrl);
                }
              }
            }
          });

          if (text && text.length > 0 && !seenTexts.has(text)) {
            seenTexts.add(text);
            tweets.push({
              text: text,
              time: time,
              link: fullLink,
              images: images
            });
          }
        });

        if (tweets.length > 0) {
          // Format tweets as objects
          const formattedTweets = tweets
            .slice(0, 10) // Latest 10 tweets
            .map((tweet, index) => ({
              id: `shams_${Date.now()}_${index}`,
              author: 'Shams Charania',
              authorHandle: '@ShamsCharania',
              text: tweet.text,
              images: tweet.images || [],
              link: tweet.link,
              timestamp: tweet.time ? new Date(tweet.time).toISOString() : new Date().toISOString()
            }));

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
    console.error('All Nitter instances failed. Returning mock data.');
    console.error('Last error:', lastError?.message);
    return this.getMockTweets();
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

