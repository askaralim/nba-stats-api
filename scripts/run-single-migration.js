#!/usr/bin/env node
/**
 * Run one SQL file against the configured DB.
 * Usage: node scripts/run-single-migration.js migrations/004_create_league_seasons.sql
 * Requires: DATABASE_URL or PG* (same as run-migrations.js)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { withSslForRailway } = require('../config/pgConnectionOptions');
const logger = require('../utils/logger');

function getConnectionConfig() {
  const url = process.env.DATABASE_URL && process.env.DATABASE_URL.trim();
  if (url) return { connectionString: url };

  const host = process.env.PGHOST;
  const port = process.env.PGPORT || '5432';
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  const database = process.env.PGDATABASE || process.env.POSTGRES_DB || 'railway';

  if (host && user && password) {
    return { host, port: parseInt(port, 10), user, password, database: database || 'railway' };
  }
  return null;
}

async function run() {
  const rel = process.argv[2];
  if (!rel) {
    logger.error({ component: 'migrate-one' }, 'Usage: node scripts/run-single-migration.js <path-to.sql>');
    process.exit(1);
  }

  const filePath = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
  if (!fs.existsSync(filePath)) {
    logger.error({ component: 'migrate-one', filePath }, 'File not found');
    process.exit(1);
  }

  const config = getConnectionConfig();
  if (!config) {
    logger.error({ component: 'migrate-one' }, 'No database config. Set DATABASE_URL or PG* vars.');
    process.exit(1);
  }

  const sql = fs.readFileSync(filePath, 'utf8');
  const pool = new Pool(
    withSslForRailway({
      ...config,
      connectionTimeoutMillis: 60000,
    })
  );
  logger.info({ component: 'migrate-one', file: path.basename(filePath) }, 'Running migration');
  try {
    await pool.query(sql);
    logger.info({ component: 'migrate-one' }, 'Done');
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  logger.error({ component: 'migrate-one', err }, 'Migration failed');
  process.exit(1);
});
