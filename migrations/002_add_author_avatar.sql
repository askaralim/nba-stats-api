-- Add author avatar URL to news table
-- Run with: npm run migrate (or psql $DATABASE_URL -f migrations/002_add_author_avatar.sql)

ALTER TABLE news ADD COLUMN IF NOT EXISTS author_avatar VARCHAR(2048);

COMMENT ON COLUMN news.author_avatar IS 'Author profile avatar image URL';
