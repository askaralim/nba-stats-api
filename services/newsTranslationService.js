/**
 * News Translation Service
 * Processes pending news articles: translates via OpenAI, updates DB
 * Async flow: separate cron picks up pending items
 */

const db = require('../config/db');
const openaiService = require('./openaiService');

const BATCH_SIZE = parseInt(process.env.NEWS_TRANSLATION_BATCH_SIZE || '5', 10);
const DELAY_MS = parseInt(process.env.NEWS_TRANSLATION_DELAY_MS || '1000', 10);

/**
 * Fetch pending news articles for translation
 * @param {number} limit - Max items to fetch
 * @returns {Promise<Array>}
 */
async function getPendingNews(limit = BATCH_SIZE) {
  if (!db.isConfigured) return [];

  const { rows } = await db.query(
    `SELECT id, original_title, original_content
     FROM news
     WHERE translation_status = 'pending'
       AND original_content IS NOT NULL
       AND LENGTH(TRIM(original_content)) > 0
     ORDER BY published_at DESC NULLS LAST, created_at ASC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

/**
 * Update news row with translation result
 * @param {string} id - UUID
 * @param {Object} result - { translated_title, translated_content }
 * @param {string} status - 'completed' | 'failed'
 * @param {string} [error] - Error message if failed
 */
async function updateTranslation(id, result, status = 'completed', error = null) {
  if (!db.isConfigured) return;

  await db.query(
    `UPDATE news
     SET translated_title = $1, translated_content = $2,
         translation_status = $3, translation_error = $4, updated_at = now()
     WHERE id = $5`,
    [
      result?.translated_title ?? null,
      result?.translated_content ?? null,
      status,
      error,
      id
    ]
  );
}

/**
 * Translate a single article and update DB
 * @param {Object} row - { id, original_title, original_content }
 * @returns {Promise<boolean>} true if success
 */
async function translateOne(row) {
  try {
    const result = await openaiService.translateNewsArticle({
      title: row.original_title || '',
      content: row.original_content
    });
    await updateTranslation(row.id, result, 'completed');
    return true;
  } catch (error) {
    console.error(`[NewsTranslation] Failed to translate ${row.id}:`, error.message);
    await updateTranslation(row.id, null, 'failed', error.message);
    return false;
  }
}

/**
 * Run translation job: process batch of pending articles
 * @returns {Promise<{ processed: number, succeeded: number, failed: number }>}
 */
async function runTranslation() {
  if (!db.isConfigured) {
    console.warn('[NewsTranslation] Database not configured');
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  if (!openaiService.apiKey) {
    console.warn('[NewsTranslation] OpenAI API key not configured');
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  const pending = await getPendingNews(BATCH_SIZE);
  if (pending.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  console.log(`[NewsTranslation] Processing ${pending.length} pending articles...`);
  let succeeded = 0;
  let failed = 0;

  for (const row of pending) {
    const ok = await translateOne(row);
    if (ok) succeeded++;
    else failed++;

    if (DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`[NewsTranslation] Done: ${succeeded} succeeded, ${failed} failed`);
  return { processed: pending.length, succeeded, failed };
}

module.exports = {
  runTranslation,
  getPendingNews,
  updateTranslation
};
