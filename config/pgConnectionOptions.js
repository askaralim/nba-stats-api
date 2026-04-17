/**
 * Shared options for node-pg when talking to Railway Postgres (public proxy / rlwy.net).
 * Without SSL, TCP can connect then stall during handshake → timeout.
 */

/**
 * @param {{ connectionString?: string; host?: string } & Record<string, unknown>} config
 * @returns {Record<string, unknown>}
 */
function withSslForRailway(config) {
  if (process.env.PGSSLMODE === 'disable') {
    return { ...config, ssl: false };
  }
  const s = config.connectionString || '';
  const host = config.host || '';
  const isRailway =
    /\brailway\.app\b/i.test(s) ||
    /\brlwy\.net\b/i.test(s) ||
    /\brailway\.app\b/i.test(host) ||
    /\brlwy\.net\b/i.test(host);
  if (isRailway) {
    if (/sslmode\s*=\s*disable/i.test(s)) {
      return config;
    }
    return { ...config, ssl: { rejectUnauthorized: false } };
  }
  return config;
}

module.exports = { withSslForRailway };
