/**
 * API v2 Routes
 * News System v2: translated news endpoints
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const dateFormatter = require('../utils/dateFormatter');
const { paginationMiddleware, createPaginationMeta } = require('../middleware/pagination');
const { asyncHandler, sendSuccess, NotFoundError, ValidationError } = require('../middleware/errorHandler');

router.use('/nba/translated-news', paginationMiddleware);

/** Decode URL-encoded image URLs for frontend use */
function decodeImageUrls(images) {
  if (!Array.isArray(images)) return [];
  return images.map((url) => {
    if (typeof url !== 'string') return url;
    try {
      return decodeURIComponent(url);
    } catch {
      return url;
    }
  });
}

/**
 * GET /api/v2/nba/translated-news
 * Paginated translated news (client-safe, no source attribution)
 */
router.get('/nba/translated-news',
  asyncHandler(async (req, res) => {
    if (!db.isConfigured) {
      return sendSuccess(res, { articles: [] }, null, 200, {
        version: 'v2',
        pagination: createPaginationMeta(req.pagination, 0)
      });
    }

    const { limit, offset } = req.pagination;
    const orderBy = req.query.sort === 'created_at' ? 'created_at DESC NULLS LAST' : 'published_at DESC NULLS LAST';

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM news WHERE translation_status = 'completed'`
    );
    const total = countResult.rows[0]?.total ?? 0;

    const { rows } = await db.query(
      `SELECT id, original_author, author_avatar, translated_title, translated_content, published_at, images
       FROM news
       WHERE translation_status = 'completed'
       ORDER BY ${orderBy}
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const articles = rows.map((row) => {
      const formatted = dateFormatter.formatNewsTimestamp(row.published_at, {
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai'
      });
      return {
        id: row.id,
        author: row.original_author || null,
        authorAvatar: row.author_avatar || null,
        title: row.translated_title || row.translated_content?.slice(0, 50) || '',
        content: row.translated_content || '',
        publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
        publishedTime: formatted?.relative || formatted?.display || null,
        images: decodeImageUrls(Array.isArray(row.images) ? row.images : [])
      };
    });

    const pagination = createPaginationMeta(req.pagination, total);

    sendSuccess(res, { articles }, null, 200, {
      version: 'v2',
      pagination
    });
  })
);

/**
 * GET /api/v2/nba/translated-news/:id
 * Single translated article by ID
 */
router.get('/nba/translated-news/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new ValidationError('Invalid article ID format');
    }

    if (!db.isConfigured) {
      throw new NotFoundError('Article');
    }

    const { rows } = await db.query(
      `SELECT id, original_author, author_avatar, translated_title, translated_content, published_at, images
       FROM news
       WHERE id = $1 AND translation_status = 'completed'`,
      [id]
    );

    if (!rows.length) {
      throw new NotFoundError('Article');
    }

    const row = rows[0];
    const formatted = dateFormatter.formatNewsTimestamp(row.published_at, {
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai'
    });

    const article = {
      id: row.id,
      author: row.original_author || null,
      authorAvatar: row.author_avatar || null,
      title: row.translated_title || row.translated_content?.slice(0, 50) || '',
      content: row.translated_content || '',
      publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
      publishedTime: formatted?.relative || formatted?.display || null,
      images: decodeImageUrls(Array.isArray(row.images) ? row.images : (row.images ? JSON.parse(row.images) : []))
    };

    sendSuccess(res, article, null, 200, { version: 'v2' });
  })
);

module.exports = router;
