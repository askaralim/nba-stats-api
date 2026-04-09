const express = require('express');
const compression = require('compression');
const cron = require('node-cron');
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

// Middleware
const corsMiddleware = require('./middleware/cors');
const { standardRateLimiter, strictRateLimiter } = require('./middleware/rateLimiter');
const { performanceMiddleware, requestIdMiddleware } = require('./middleware/performance');
const { paginationMiddleware } = require('./middleware/pagination');
const {
  validateGameId,
  validateDate,
  validateTeamAbbreviation,
  validatePlayerId,
  validatePagination,
  validateGameFilters
} = require('./middleware/validation');
const {
  asyncHandler,
  errorHandler,
  notFoundHandler,
  sendSuccess,
  NotFoundError,
  ValidationError,
  ExternalAPIError
} = require('./middleware/errorHandler');

class WebServer {
  constructor(port = 3000) {
    this.app = express();
    this.port = port;
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

    // CORS middleware (supports web and mobile)
    this.app.use(corsMiddleware);

    // Rate limiting (applied to all routes)
    this.app.use('/api', standardRateLimiter);
  }

  setupCronJobs() {
    // ============================================
    // STARTUP PRE-FETCH (High Priority Data)
    // ============================================
    console.log('Initializing startup pre-fetch...');

    // 1. Today's Games - Most frequently accessed endpoint
    console.log('  → Pre-fetching today\'s games...');
    nbaService.getTodaysScoreboard().catch(err => {
      console.error('  ✗ Failed to fetch today\'s games on startup:', err);
    });

    // 2. Current Season Standings - Commonly accessed
    console.log('  → Pre-fetching current season standings...');
    standingsService.getStandings({ season: seasonDefaults.STANDINGS_YEAR, seasonType: seasonDefaults.STANDINGS_TYPE }).catch(err => {
      console.error('  ✗ Failed to fetch standings on startup:', err);
    });

    // 3. All Team Info - Static data, used across multiple pages
    console.log('  → Pre-fetching all team info (30 teams)...');
    teamService.prefetchAllTeamInfo().catch(err => {
      console.error('  ✗ Failed to pre-fetch team info on startup:', err);
    });

    // 4. News - Expensive operation, frequently accessed
    // console.log('  → Pre-fetching news...');
    // newsService.getShamsTweets().catch(err => {
    //   console.error('  ✗ Failed to fetch news on startup:', err);
    // });
    

    console.log('Startup pre-fetch initiated (non-blocking)');

    // ============================================
    // SCHEDULED CRON JOBS
    // ============================================
    
    // News v2 Ingestion: Every 5 minutes (fetch, dedupe, insert into DB)
    cron.schedule('*/5 * * * *', async () => {
      console.log('[Cron] News ingestion (scheduled every 5 minutes)...');
      try {
        const result = await newsIngestionService.runIngestion();
        console.log(`[Cron] ✓ News ingestion: ${result.inserted} inserted, ${result.skipped} skipped`);
      } catch (error) {
        console.error('[Cron] ✗ News ingestion failed:', error);
      }
    });

    // News v2 Translation: Every 3 minutes (translate pending articles)
    cron.schedule('*/3 * * * *', async () => {
      console.log('[Cron] News translation (scheduled every 3 minutes)...');
      try {
        const result = await newsTranslationService.runTranslation();
        if (result.processed > 0) {
          console.log(`[Cron] ✓ News translation: ${result.succeeded} succeeded, ${result.failed} failed`);
        }
      } catch (error) {
        console.error('[Cron] ✗ News translation failed:', error);
      }
    });

    // Today's Games: Every 2 minutes during game hours (optional)
    // Only refresh if there are live games to avoid unnecessary API calls
    cron.schedule('*/2 * * * *', async () => {
      console.log('[Cron] Refreshing today\'s games (scheduled every 2 minutes)...');
      try {
        await nbaService.getTodaysScoreboard();
        console.log('[Cron] ✓ Today\'s games refreshed successfully');
      } catch (error) {
        console.error('[Cron] ✗ Failed to refresh today\'s games:', error);
      }
    });

    // Standings: Every 30 minutes (updates after games complete)
    cron.schedule('*/30 * * * *', async () => {
      console.log('[Cron] Refreshing standings (scheduled every 30 minutes)...');
      try {
        await standingsService.getStandings({ season: seasonDefaults.STANDINGS_YEAR, seasonType: seasonDefaults.STANDINGS_TYPE });
        console.log('[Cron] ✓ Standings refreshed successfully');
      } catch (error) {
        console.error('[Cron] ✗ Failed to refresh standings:', error);
      }
    });

    // Team Info: Every 30 minutes (static data, but refresh periodically)
    cron.schedule('*/30 * * * *', async () => {
      console.log('[Cron] Refreshing all team info (scheduled every 30 minutes)...');
      try {
        const results = await teamService.prefetchAllTeamInfo(true); // Force refresh
        console.log(`[Cron] ✓ Team info refreshed: ${results.success} succeeded, ${results.failed} failed`);
      } catch (error) {
        console.error('[Cron] ✗ Failed to refresh team info:', error);
      }
    });

    // Push notifications: close games (last 5 min Q4+) + MVP GIS when a game ends.
    // Set DISABLE_PUSH_CRON=true in production until Expo/APNs delivery is verified end-to-end.
    cron.schedule('* * * * *', async () => {
      try {
        await pushNotificationService.runScheduledChecks();
      } catch (error) {
        console.error('[Cron] ✗ Push notification check failed:', error);
      }
    });

    console.log('Cron jobs initialized:');
    console.log('  - News ingestion: every 5 minutes');
    console.log('  - News translation: every 3 minutes');
    console.log('  - Today\'s Games: every 2 minutes');
    console.log('  - Standings: every 30 minutes');
    console.log('  - Team Info: every 30 minutes');
    console.log('  - Push alerts (close game / MVP GIS): every minute (set DISABLE_PUSH_CRON=true to disable)');
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
    
    // 404 handler for undefined routes (must be after all routes)
    this.app.use(notFoundHandler);

    // Global error handler (must be last)
    this.app.use(errorHandler);
  }

  start() {
    this.app.listen(this.port, '0.0.0.0', () => {
      console.log(`Server is running on http://0.0.0.0:${this.port}`);
    });
  }

  getApp() {
    return this.app;
  }
}

module.exports = WebServer;

