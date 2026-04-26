require('dotenv').config();

// Sentry must be initialized BEFORE any other module that should be
// auto-instrumented (Express, http, pg, etc.). This is why it sits at
// the top of the entry file, before requiring server/logger.
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
  const Sentry = require('@sentry/node');
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || 'production',
    release: process.env.RAILWAY_GIT_COMMIT_SHA,
    tracesSampleRate: 0,
    integrations: [Sentry.httpIntegration(), Sentry.expressIntegration()],
  });
}

const logger = require('./utils/logger');
const WebServer = require('./server');

const PORT = process.env.PORT || 3000;

const server = new WebServer(PORT);
server.start();

let shutting = false;
async function shutdown(signal) {
  if (shutting) return;
  shutting = true;
  logger.info({ component: 'shutdown', signal }, 'Received signal, draining');
  try {
    await server.stop();
    logger.info({ component: 'shutdown' }, 'Clean exit');
    process.exit(0);
  } catch (err) {
    logger.error({ component: 'shutdown', err }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.fatal({ component: 'process', err: reason }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ component: 'process', err }, 'Uncaught exception');
});

