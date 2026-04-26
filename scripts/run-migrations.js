#!/usr/bin/env node
/**
 * Run database migrations
 * Usage: node scripts/run-migrations.js
 * Requires: DATABASE_URL or PG* env vars
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
  const config = getConnectionConfig();
  if (!config) {
    logger.error({ component: 'migrate' }, 'No database config. Set DATABASE_URL or PG* vars.');
    process.exit(1);
  }

  const pool = new Pool(withSslForRailway({ ...config, connectionTimeoutMillis: 60000 }));
  const migrationsDir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    logger.info({ component: 'migrate', file }, 'Running migration');
    try {
      await pool.query(sql);
      logger.info({ component: 'migrate', file }, 'Migration completed');
    } catch (err) {
      logger.error({ component: 'migrate', file, errorMessage: err.message }, 'Migration failed');
      await pool.end();
      process.exit(1);
    }
  }

  await pool.end();
  logger.info({ component: 'migrate' }, 'All migrations complete');
}

run().catch((err) => {
  logger.error({ component: 'migrate', err }, 'Migration runner crashed');
  process.exit(1);
});
