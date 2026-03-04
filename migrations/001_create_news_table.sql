-- News System v2: Create news table for ingested and translated articles
-- Run with: psql $DATABASE_URL -f migrations/001_create_news_table.sql

CREATE TABLE IF NOT EXISTS news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id VARCHAR(255) NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  original_title TEXT,
  original_content TEXT NOT NULL,
  original_source_url VARCHAR(2048),
  original_author VARCHAR(255),
  original_author_handle VARCHAR(100),
  author_avatar VARCHAR(2048),
  translated_title TEXT,
  translated_content TEXT,
  translation_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  translation_error TEXT,
  published_at TIMESTAMPTZ,
  images JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_news_source_id UNIQUE (source_id)
);

-- UNIQUE on source_id creates index automatically
CREATE INDEX IF NOT EXISTS idx_news_published_at ON news (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_translation_status ON news (translation_status);
CREATE INDEX IF NOT EXISTS idx_news_created_at ON news (created_at DESC);

-- Index for fetching translated articles (API listing)
CREATE INDEX IF NOT EXISTS idx_news_translated_list 
  ON news (published_at DESC) 
  WHERE translation_status = 'completed';

COMMENT ON TABLE news IS 'NBA news articles ingested from external sources, translated to Simplified Chinese';
