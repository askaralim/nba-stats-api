/**
 * PostgreSQL connection pool and helpers.
 * Optional: app runs without DB when no connection config is set.
 *
 * Supports:
 * - DATABASE_URL (Railway Variable Reference or local .env)
 * - Or PG* vars: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE (Railway provides these)
 */

const { Pool } = require('pg');
const { withSslForRailway } = require('./pgConnectionOptions');

function getConnectionConfig() {
  const url = process.env.DATABASE_URL && process.env.DATABASE_URL.trim();
  if (url) return { connectionString: url };

  const host = process.env.PGHOST;
  const port = process.env.PGPORT || '5432';
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  const database = process.env.PGDATABASE || process.env.POSTGRES_DB || 'railway';

  if (host && user && password) {
    return {
      host,
      port: parseInt(port, 10),
      user,
      password,
      database: database || 'railway',
    };
  }

  return null;
}

const connectionConfig = getConnectionConfig();
const isConfigured = Boolean(connectionConfig);

/** @type {import('pg').Pool|null} */
let pool = null;

if (isConfigured) {
  pool = new Pool(
    withSslForRailway({
      ...connectionConfig,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
  );

  pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
  });

  // Prevent process crash when the server closes an idle connection (client emits 'error').
  pool.on('connect', (client) => {
    client.on('error', (err) => {
      console.error('[DB] Client connection error (will be replaced in pool):', err.message);
    });
  });
}

/**
 * Get the shared pool (null if DATABASE_URL not set).
 * @returns {import('pg').Pool|null}
 */
function getPool() {
  return pool;
}

/**
 * Run a parameterized query using the pool.
 * No-op when DATABASE_URL is not set; returns { rows: [], rowCount: 0 }.
 * @param {string} text - SQL (use $1, $2, ... for params)
 * @param {unknown[]} [params]
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params = []) {
  if (!pool) {
    return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
  }
  return pool.query(text, params);
}

/**
 * Get a client from the pool for transactions (client.release() when done).
 * Returns null when DATABASE_URL is not set.
 * @returns {Promise<import('pg').PoolClient|null>}
 */
async function getClient() {
  if (!pool) return null;
  return pool.connect();
}

/**
 * Check DB connectivity.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function healthCheck() {
  if (!pool) return { ok: false, error: 'Database not configured (set DATABASE_URL or PG* vars)' };
  try {
    await pool.query('SELECT 1');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Close the shared pool (graceful shutdown).
 * Safe to call when the pool is not configured.
 * @returns {Promise<void>}
 */
async function closePool() {
  if (!pool) return;
  try {
    await pool.end();
  } catch (err) {
    console.error('[DB] Failed to close pool cleanly:', err?.message || err);
  }
}

module.exports = {
  getPool,
  query,
  getClient,
  healthCheck,
  closePool,
  isConfigured: Boolean(pool),
};
