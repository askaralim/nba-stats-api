/**
 * News Ingestion Service
 * Fetches raw news from sources, normalizes, deduplicates, and inserts into DB
 * Phase 1: Twitter/Nitter only
 */

const crypto = require('crypto');
const db = require('../config/db');
const newsService = require('./newsService');

const SOURCE_TYPE = 'twitter';

/**
 * Extract source_id from tweet for deduplication
 * Format: twitter_{username}_{tweetId} or twitter_hash_{hash} if no link
 * @param {Object} tweet - Tweet object with link and text
 * @returns {string} source_id
 */
/** Decode URL-encoded image URLs before storing */
function decodeImageUrls(images) {
  if (!Array.isArray(images)) return images;
  return images.map((url) => {
    if (typeof url !== 'string') return url;
    try {
      return decodeURIComponent(url);
    } catch {
      return url;
    }
  });
}

function getSourceId(tweet) {
  const link = tweet.link;
  if (link) {
    const match = link.match(/x\.com\/([^/]+)\/status\/(\d+)/i) ||
                  link.match(/twitter\.com\/([^/]+)\/status\/(\d+)/i);
    if (match) {
      return `twitter_${match[1]}_${match[2]}`;
    }
  }
  const hash = crypto.createHash('sha256').update(tweet.text || '').digest('hex').slice(0, 32);
  return `twitter_hash_${hash}`;
}

/**
 * Normalize tweet to news row shape
 * @param {Object} tweet - Raw tweet from newsService
 * @returns {Object} Normalized news row
 */
function normalizeTweet(tweet) {
  const sourceId = getSourceId(tweet);
  const publishedAt = tweet.timestamp ? new Date(tweet.timestamp) : new Date();
  const rawImages = tweet.images || [];
  const images = rawImages.length > 0 ? decodeImageUrls(rawImages) : null;

  return {
    source_id: sourceId,
    source_type: SOURCE_TYPE,
    original_title: null,
    original_content: tweet.text || '',
    original_source_url: tweet.link || null,
    original_author: tweet.author || null,
    original_author_handle: tweet.authorHandle || null,
    author_avatar: tweet.avatar || null,
    translated_title: null,
    translated_content: null,
    translation_status: 'pending',
    published_at: publishedAt,
    images: images ? JSON.stringify(images) : null,
    metadata: null
  };
}

/**
 * Insert news articles into DB with deduplication (ON CONFLICT DO NOTHING)
 * @param {Array<Object>} rows - Normalized news rows
 * @returns {Promise<{ inserted: number, skipped: number }>}
 */
async function insertNews(rows) {
  if (!db.isConfigured) {
    console.warn('[NewsIngestion] Database not configured, skipping insert');
    return { inserted: 0, skipped: rows.length };
  }

  let inserted = 0;
  const client = await db.getClient();
  if (!client) return { inserted: 0, skipped: rows.length };

  try {
    for (const row of rows) {
      try {
        const result = await client.query(
          `INSERT INTO news (
            source_id, source_type, original_title, original_content,
            original_source_url, original_author, original_author_handle, author_avatar,
            translated_title, translated_content, translation_status,
            published_at, images, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (source_id) DO NOTHING`,
          [
            row.source_id,
            row.source_type,
            row.original_title,
            row.original_content,
            row.original_source_url,
            row.original_author,
            row.original_author_handle,
            row.author_avatar,
            row.translated_title,
            row.translated_content,
            row.translation_status,
            row.published_at,
            row.images,
            row.metadata
          ]
        );
        if (result.rowCount > 0) {
          inserted++;
        }
      } catch (err) {
        console.error(`[NewsIngestion] Failed to insert ${row.source_id}:`, err.message);
      }
    }
    return { inserted, skipped: rows.length - inserted };
  } finally {
    client.release();
  }
}

/**
 * Run full ingestion: fetch tweets, normalize, dedupe, insert
 * @param {Object} options - { maxRetries?: number }
 * @returns {Promise<{ success: boolean, inserted: number, skipped: number, error?: string }>}
 */
async function runIngestion(options = {}) {
  const maxRetries = options.maxRetries ?? 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[NewsIngestion] Fetching tweets (attempt ${attempt}/${maxRetries})...`);
      const tweets = await newsService.getShamsTweets();

      if (!tweets || tweets.length === 0) {
        console.warn('[NewsIngestion] No tweets fetched');
        return { success: true, inserted: 0, skipped: 0 };
      }

      const rows = tweets.map(normalizeTweet);
      const { inserted, skipped } = await insertNews(rows);

      console.log(`[NewsIngestion] Done: ${inserted} inserted, ${skipped} skipped (duplicates)`);
      return { success: true, inserted, skipped };
    } catch (error) {
      console.error(`[NewsIngestion] Attempt ${attempt} failed:`, error.message);
      if (attempt === maxRetries) {
        return { success: false, inserted: 0, skipped: 0, error: error.message };
      }
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return { success: false, inserted: 0, skipped: 0, error: 'Max retries exceeded' };
}

module.exports = {
  runIngestion,
  getSourceId,
  normalizeTweet,
  insertNews
};
