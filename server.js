const express = require('express');
const compression = require('compression');
const cron = require('node-cron');
const pinoHttp = require('pino-http');
const Sentry = require('@sentry/node');
const logger = require('./utils/logger');
const nbaService = require('./services/nbaService');
const espnScraperService = require('./services/espnScraperService');
const standingsService = require('./services/standingsService');
const teamService = require('./services/teamService');
const newsService = require('./services/newsService');
const newsIngestionService = require('./services/newsIngestionService');
const newsTranslationService = require('./services/newsTranslationService');
const playerService = require('./services/playerService');
const gameTransformer = require('./utils/gameTransformer');
const pushNotificationService = require('./services/pushNotificationService');
const seasonDefaults = require('./config/seasonDefaults');

const corsMiddleware = require('./middleware/cors');
const { standardRateLimiter } = require('./middleware/rateLimiter');
const { performanceMiddleware, requestIdMiddleware } = require('./middleware/performance');
const {
  errorHandler,
  notFoundHandler,
  sendSuccess
} = require('./middleware/errorHandler');

const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.requestId,
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url === '/favicon.ico',
  },
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});

class WebServer {
  constructor(port = 3000) {
    this.app = express();
    this.port = port;
    this.httpServer = null;
    this.cronTasks = [];
    this.shuttingDown = false;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupCronJobs();
  }

  setupMiddleware() {
    // Gzip compression (should be early to compress all responses)
    // Compresses responses > 1KB, filters out already compressed content
    this.app.use(compression({
      filter: (req, res) => {
        // Don't compress if client doesn't support it
        if (req.headers['x-no-compression']) {
          return false;
        }
        // Use compression filter function
        return compression.filter(req, res);
      },
      level: 6, // Compression level (1-9, 6 is a good balance)
      threshold: 1024 // Only compress responses > 1KB
    }));

    // Parse JSON bodies
    this.app.use(express.json());
    
    // Parse URL-encoded bodies
    this.app.use(express.urlencoded({ extended: true }));

    // Trust proxy for accurate IP addresses (important for rate limiting)
    this.app.set('trust proxy', 1);

    // Performance monitoring (must be early to track all requests)
    this.app.use(performanceMiddleware);
    this.app.use(requestIdMiddleware);

    // Structured request logging (uses requestIdMiddleware-supplied req.requestId)
    this.app.use(httpLogger);

    // CORS middleware (supports web and mobile)
    this.app.use(corsMiddleware);

    // Rate limiting (applied to all routes)
    this.app.use('/api', standardRateLimiter);
  }

  setupCronJobs() {
    logger.info({ component: 'startup' }, 'Initializing startup pre-fetch');

    nbaService.getTodaysScoreboard().catch((err) => {
      logger.error({ component: 'startup', task: 'todaysGames', err }, 'Startup pre-fetch failed');
    });

    standingsService.getStandings({ season: seasonDefaults.STANDINGS_YEAR, seasonType: seasonDefaults.STANDINGS_TYPE }).catch((err) => {
      logger.error({ component: 'startup', task: 'standings', err }, 'Startup pre-fetch failed');
    });

    teamService.prefetchAllTeamInfo().catch((err) => {
      logger.error({ component: 'startup', task: 'teamInfo', err }, 'Startup pre-fetch failed');
    });

    logger.info({ component: 'startup' }, 'Startup pre-fetch initiated (non-blocking)');

    const register = (task) => {
      this.cronTasks.push(task);
      return task;
    };

    register(cron.schedule('*/5 * * * *', async () => {
      if (this.shuttingDown) return;
      logger.info({ component: 'cron', task: 'newsIngestion' }, 'News ingestion: starting (every 5m)');
      try {
        const result = await newsIngestionService.runIngestion();
        logger.info({ component: 'cron', task: 'newsIngestion', inserted: result.inserted, skipped: result.skipped }, 'News ingestion: completed');
      } catch (err) {
        logger.error({ component: 'cron', task: 'newsIngestion', err }, 'News ingestion: failed');
      }
    }));

    register(cron.schedule('*/3 * * * *', async () => {
      if (this.shuttingDown) return;
      logger.info({ component: 'cron', task: 'newsTranslation' }, 'News translation: starting (every 3m)');
      try {
        const result = await newsTranslationService.runTranslation();
        if (result.processed > 0) {
          logger.info({ component: 'cron', task: 'newsTranslation', succeeded: result.succeeded, failed: result.failed }, 'News translation: completed');
        }
      } catch (err) {
        logger.error({ component: 'cron', task: 'newsTranslation', err }, 'News translation: failed');
      }
    }));

    register(cron.schedule('*/2 * * * *', async () => {
      if (this.shuttingDown) return;
      logger.info({ component: 'cron', task: 'todaysGames' }, "Today's games refresh: starting (every 2m)");
      try {
        await nbaService.getTodaysScoreboard();
        logger.info({ component: 'cron', task: 'todaysGames' }, "Today's games refresh: completed");
      } catch (err) {
        logger.error({ component: 'cron', task: 'todaysGames', err }, "Today's games refresh: failed");
      }
    }));

    register(cron.schedule('*/30 * * * *', async () => {
      if (this.shuttingDown) return;
      logger.info({ component: 'cron', task: 'standings' }, 'Standings refresh: starting (every 30m)');
      try {
        await standingsService.getStandings({ season: seasonDefaults.STANDINGS_YEAR, seasonType: seasonDefaults.STANDINGS_TYPE });
        logger.info({ component: 'cron', task: 'standings' }, 'Standings refresh: completed');
      } catch (err) {
        logger.error({ component: 'cron', task: 'standings', err }, 'Standings refresh: failed');
      }
    }));

    register(cron.schedule('*/30 * * * *', async () => {
      if (this.shuttingDown) return;
      logger.info({ component: 'cron', task: 'teamInfo' }, 'Team info refresh: starting (every 30m)');
      try {
        const results = await teamService.prefetchAllTeamInfo(true);
        logger.info({ component: 'cron', task: 'teamInfo', succeeded: results.success, failed: results.failed }, 'Team info refresh: completed');
      } catch (err) {
        logger.error({ component: 'cron', task: 'teamInfo', err }, 'Team info refresh: failed');
      }
    }));

    // Push notifications: close games (last 5 min Q4+) + MVP GIS when a game ends.
    // Set DISABLE_PUSH_CRON=true in production until Expo/APNs delivery is verified end-to-end.
    register(cron.schedule('* * * * *', async () => {
      if (this.shuttingDown) return;
      try {
        await pushNotificationService.runScheduledChecks();
      } catch (err) {
        logger.error({ component: 'cron', task: 'pushNotifications', err }, 'Push notification check failed');
      }
    }));

    logger.info({ component: 'cron' }, 'Cron jobs initialized: news ingest 5m, translation 3m, games 2m, standings 30m, team info 30m, push 1m');
  }

  setupRoutes() {
    // Health check endpoint (includes DB when DATABASE_URL is set)
    this.app.get('/health', async (req, res) => {
      const db = require('./config/db');
      const payload = { status: 'ok', message: 'Server is running' };
      if (db.isConfigured) {
        const dbHealth = await db.healthCheck();
        payload.database = dbHealth.ok ? 'connected' : { status: 'error', message: dbHealth.error };
      }
      sendSuccess(res, payload);
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      sendSuccess(res, { message: 'Welcome to NBA Stats Demo API' });
    });

    // Mount v1 API routes (versioned API)
    const v1Routes = require('./routes/v1');
    this.app.use('/api/v1', v1Routes);

    // Mount v2 API routes (News System v2)
    const v2Routes = require('./routes/v2');
    this.app.use('/api/v2', v2Routes);

    // Legacy routes removed - all clients should use /api/v1/nba/* or /api/v2/nba/*
    
    // Ignore favicon requests (browsers auto-request this)
    this.app.get('/favicon.ico', (req, res) => {
      res.status(204).end();
    });

    // Sentry error capture must run before our app's error handlers so it can
    // observe the exception; it then calls next(err) so errorHandler still
    // produces the response. No-op when Sentry isn't initialized.
    Sentry.setupExpressErrorHandler(this.app);

    // 404 handler for undefined routes (must be after all routes)
    this.app.use(notFoundHandler);

    // Global error handler (must be last)
    this.app.use(errorHandler);
  }

  start() {
    this.httpServer = this.app.listen(this.port, '0.0.0.0', () => {
      logger.info({ component: 'server', port: this.port }, 'Server listening');
    });
    return this.httpServer;
  }

  /**
   * Graceful shutdown: stop accepting new connections, halt cron tasks, close DB.
   * @param {number} [timeoutMs=10000] - Hard deadline to force exit if listeners hang.
   * @returns {Promise<void>}
   */
  async stop(timeoutMs = 10000) {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    for (const task of this.cronTasks) {
      try {
        if (task && typeof task.stop === 'function') task.stop();
      } catch (err) {
        logger.error({ component: 'shutdown', err }, 'Failed to stop cron task');
      }
    }

    const closeHttp = new Promise((resolve) => {
      if (!this.httpServer) return resolve();
      this.httpServer.close((err) => {
        if (err) logger.error({ component: 'shutdown', err }, 'HTTP server close error');
        resolve();
      });
    });

    const deadline = new Promise((resolve) => setTimeout(resolve, timeoutMs));
    await Promise.race([closeHttp, deadline]);

    try {
      const db = require('./config/db');
      if (typeof db.closePool === 'function') {
        await db.closePool();
      }
    } catch (err) {
      logger.error({ component: 'shutdown', err }, 'DB close error');
    }
  }

  getApp() {
    return this.app;
  }
}

module.exports = WebServer;

