/**
 * API v1 Routes
 * Versioned API routes with pagination and performance monitoring
 */

const express = require('express');
const router = express.Router();
const nbaService = require('../services/nbaService');
const espnScraperService = require('../services/espnScraperService');
const standingsService = require('../services/standingsService');
const teamService = require('../services/teamService');
const newsService = require('../services/newsService');
const playerService = require('../services/playerService');
const gameTransformer = require('../utils/gameTransformer');
const { paginateArray, createPaginationMeta, paginationMiddleware } = require('../middleware/pagination');
const { standardRateLimiter, strictRateLimiter } = require('../middleware/rateLimiter');
const { formatPlayerNameForDisplay } = require('../utils/playerName');
const {
  validateGameId,
  validateDate,
  validateTeamAbbreviation,
  validatePlayerId,
  validatePagination,
  validateGameFilters
} = require('../middleware/validation');
const {
  asyncHandler,
  sendSuccess,
  NotFoundError,
  ValidationError,
  ExternalAPIError
} = require('../middleware/errorHandler');
const { getTeamNameZhCn, getTeamCityZhCn } = require('../utils/teamTranslations');
const seasonDefaults = require('../config/seasonDefaults');

// Response cache for endpoint-level caching (reusable across all endpoints)
// Usage: responseCache.get(cacheKey, ttlMs) / responseCache.set(cacheKey, data, ttlMs)
// Example: const cached = responseCache.get(`game_${gameId}`, 60 * 1000); // 1 min cache
const responseCache = require('../services/responseCache');
const pushNotificationService = require('../services/pushNotificationService');
const seasonTypeCache = require('../services/seasonTypeCache');

// Apply pagination middleware to all list endpoints
router.use('/nba/games/today', paginationMiddleware);
router.use('/nba/stats/players', paginationMiddleware);
router.use('/nba/news', paginationMiddleware);
router.use('/nba/teams/:teamAbbreviation/schedule', paginationMiddleware);
router.use('/nba/teams/:teamAbbreviation/recent-games', paginationMiddleware);

// Remote client flags (e.g. show ESPN headshots after App Review without a new binary)
router.get('/app/config',
  asyncHandler(async (req, res) => {
    const showPlayerHeadshots = process.env.SHOW_PLAYER_HEADSHOTS === 'true';
    sendSuccess(res, { showPlayerHeadshots }, null, 200, { version: 'v1' });
  })
);

// Get games for a specific date (defaults to today) - WITH PAGINATION
router.get('/nba/games/today',
  validateDate,
  validateGameFilters,
  validatePagination,
  asyncHandler(async (req, res) => {
    const { date, featured, closeGames, overtime, marquee } = req.query;
    const pagination = req.pagination;
    
    const scoreboardData = date 
      ? await nbaService.getScoreboard(date)
      : await nbaService.getTodaysScoreboard();
    
    const transformed = gameTransformer.transformScoreboard(scoreboardData, true);
    
    // Apply filters if specified
    let filteredGames = transformed.games;
    if (closeGames === 'true') {
      filteredGames = filteredGames.filter(game => game.isClosest === true);
    }
    if (overtime === 'true') {
      filteredGames = filteredGames.filter(game => game.isOvertime === true);
    }
    if (marquee === 'true') {
      filteredGames = filteredGames.filter(game => game.isMarquee === true);
    }
    
    // Sort games by priority
    const sortedGames = gameTransformer.sortGamesByPriority(filteredGames);
    
    // Paginate games
    const paginated = paginateArray(sortedGames, pagination);
    
    // If featured=true, identify featured games
    let responseData = {
      ...transformed,
      games: paginated.data,
      date: transformed.date || date || new Date().toISOString().split('T')[0].replace(/-/g, ''),
      totalGames: paginated.meta.pagination.total
    };
    
    if (featured === 'true') {
      const { featured: featuredGames, other: otherGames } = 
        gameTransformer.identifyFeaturedGames(sortedGames);
      
      // Paginate featured and other separately
      const paginatedFeatured = paginateArray(featuredGames, pagination);
      const paginatedOther = paginateArray(otherGames, pagination);
      
      responseData.featured = paginatedFeatured.data;
      responseData.other = paginatedOther.data;
    }
    
    sendSuccess(res, responseData, null, 200, {
      version: 'v1',
      pagination: paginated.meta.pagination
    });
  })
);

// Get game details by gameId
router.get('/nba/games/:gameId',
  validateGameId,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    
    // Check response cache first (10 seconds for live games, 5 minutes for finished)
    const cacheKey = `game_details_${gameId}`;
    const cachedResponse = responseCache.get(cacheKey, 10 * 1000); // 10 seconds default
    
    if (cachedResponse) {
      return sendSuccess(res, cachedResponse, null, 200, { version: 'v1' });
    }
    
    const { event, summaryData } = await nbaService.getGameDetails(gameId);
    const transformed = gameTransformer.transformGame(event);
    if (!transformed) {
      throw new NotFoundError('Game');
    }
    
    if (summaryData?.boxscore) {
      transformed.boxscore = gameTransformer.transformBoxscore(summaryData.boxscore);
    }
    
    if (summaryData) {
      const seasonSeries = gameTransformer.transformSeasonSeries(summaryData, transformed);
      if (seasonSeries) {
        transformed.seasonSeries = seasonSeries;
      }
      
      const injuries = gameTransformer.transformInjuries(summaryData, transformed);
      if (injuries) {
        transformed.injuries = injuries;
      }
    }
    
    // Cache response: shorter TTL for live games, longer for finished games
    const ttl = transformed.gameStatus === 3 ? 5 * 60 * 1000 : 10 * 1000; // 5 min for finished, 10s for live
    responseCache.set(cacheKey, transformed, ttl);
    
    sendSuccess(res, transformed, null, 200, { version: 'v1' });
  })
);

// --- Game summary (AI) helpers ---
const GAME_SUMMARY_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Load and validate finished game + boxscore, then return or generate AI summary.
 * @param {string} gameId
 * @returns {Promise<{ summary: string, source: string, generatedAt: string }>}
 * @throws {NotFoundError|ValidationError|ExternalAPIError}
 */
async function getGameSummaryPayload(gameId) {
  const { event, summaryData } = await nbaService.getGameDetails(gameId);
  const transformed = gameTransformer.transformGame(event);
  if (!transformed) throw new NotFoundError('Game');
  if (transformed.gameStatus !== 3) {
    throw new ValidationError('AI summary is only available for finished games');
  }

  if (!summaryData?.boxscore) throw new NotFoundError('Game boxscore');

  const boxscore = gameTransformer.transformBoxscore(summaryData.boxscore);
  if (!boxscore) throw new NotFoundError('Game boxscore');

  let teamStatistics = boxscore.teamStatistics;
  if (!teamStatistics && boxscore.teams && boxscore.teams.length >= 2) {
    teamStatistics = gameTransformer.extractTeamStatistics(summaryData.boxscore, boxscore.teams);
    if (teamStatistics) boxscore.teamStatistics = teamStatistics;
  }
  if (!teamStatistics) throw new NotFoundError('Team statistics');

  const gameSummaryCache = require('../services/gameSummaryCache');
  const openaiService = require('../services/openaiService');
  let aiSummary = gameSummaryCache.get(gameId);

  if (aiSummary) return aiSummary;

  const gameFacts = gameTransformer.computeGameFacts(
    transformed,
    summaryData.boxscore,
    teamStatistics
  );

  if (gameFacts) {
    try {
      const summaryText = await openaiService.generateGameSummary(gameFacts);
      gameSummaryCache.set(gameId, summaryText, 'ai');
      return {
        summary: summaryText,
        source: 'ai',
        generatedAt: new Date().toISOString()
      };
    } catch (aiError) {
      console.error('AI summary generation failed:', aiError.message);
      if (boxscore.gameStory) {
        const fallbackSummary = boxscore.gameStory.summary;
        gameSummaryCache.set(gameId, fallbackSummary, 'fallback');
        return {
          summary: fallbackSummary,
          source: 'fallback',
          generatedAt: new Date().toISOString()
        };
      }
      throw new ExternalAPIError('AI summary generation failed and no fallback available');
    }
  }

  if (boxscore.gameStory) {
    const fallbackSummary = boxscore.gameStory.summary;
    gameSummaryCache.set(gameId, fallbackSummary, 'fallback');
    return {
      summary: fallbackSummary,
      source: 'fallback',
      generatedAt: new Date().toISOString()
    };
  }

  throw new ExternalAPIError('Unable to compute game facts and no fallback available');
}

// Get AI game summary - Strict rate limit
router.get('/nba/games/:gameId/summary',
  validateGameId,
  strictRateLimiter,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const cacheKey = `game_summary_${gameId}`;

    const cachedResponse = responseCache.get(cacheKey, GAME_SUMMARY_CACHE_TTL_MS);
    if (cachedResponse) {
      return sendSuccess(res, cachedResponse, null, 200, { version: 'v1' });
    }

    const aiSummary = await getGameSummaryPayload(gameId);
    responseCache.set(cacheKey, aiSummary, GAME_SUMMARY_CACHE_TTL_MS);
    sendSuccess(res, aiSummary, null, 200, { version: 'v1' });
  })
);

// Get ESPN player stats - WITH PAGINATION
router.get('/nba/stats/players',
  validatePagination,
  asyncHandler(async (req, res) => {
    const {
      season = seasonDefaults.ESPN_PLAYER_STATS_SEASON,
      position = 'all-positions',
      conference = '0',
      page = '1',
      limit = '20', // Mobile-friendly default
      sort = 'offensive.avgPoints:desc'
    } = req.query;
    
    const options = {
      season: season.trim(),
      position: position.trim(),
      conference: conference.trim(),
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      sort: sort.trim()
    };
    
    const statsData = await espnScraperService.getPlayerStats(options);
    
    // Add pagination metadata if not present
    const paginationMeta = statsData.metadata?.totalCount 
      ? createPaginationMeta(
          { page: options.page, limit: options.limit },
          statsData.metadata.totalCount
        )
      : null;
    
    sendSuccess(res, statsData, null, 200, {
      version: 'v1',
      ...(paginationMeta && { pagination: paginationMeta })
    });
  })
);

// Get all NBA teams (list) - MUST be before /nba/teams/:teamAbbreviation
router.get('/nba/teams',
  asyncHandler(async (req, res) => {
    const teams = await teamService.getAllTeams();
    sendSuccess(res, { teams }, null, 200, { version: 'v1' });
  })
);

router.get('/nba/standings',
  asyncHandler(async (req, res) => {
    const {
      season = String(seasonDefaults.STANDINGS_YEAR),
      seasonType = String(seasonDefaults.STANDINGS_TYPE)
    } = req.query;
    
    const options = {
      season: parseInt(season, 10) || seasonDefaults.STANDINGS_YEAR,
      seasonType: parseInt(seasonType, 10) || seasonDefaults.STANDINGS_TYPE
    };
    
    const standingsData = await standingsService.getStandings(options);
    sendSuccess(res, standingsData, null, 200, { version: 'v1' });
  })
);

// Get team roster (basic player info) - MUST be before /nba/teams/:teamAbbreviation
router.get('/nba/teams/:teamAbbreviation/roster',
  validateTeamAbbreviation,
  asyncHandler(async (req, res) => {
    const { teamAbbreviation } = req.params;
    const rosterData = await teamService.getTeamRoster(teamAbbreviation);
    sendSuccess(res, rosterData, null, 200, { version: 'v1' });
  })
);

// Get team details
router.get('/nba/teams/:teamAbbreviation',
  validateTeamAbbreviation,
  asyncHandler(async (req, res) => {
    const { teamAbbreviation } = req.params;
    
    const [teamInfo, teamStats, statRankings] = await Promise.all([
      teamService.getTeamInfo(teamAbbreviation),
      teamService.getTeamStatistics(teamAbbreviation),
      teamService.getAllTeamsStatRankings().catch(() => null)
    ]);
    
    const teamTotals = {};
    if (teamStats.teamTotals && Array.isArray(teamStats.teamTotals)) {
      teamStats.teamTotals.forEach(category => {
        if (Array.isArray(category.stats)) {
          category.stats.forEach(stat => {
            const statName = stat.name;
            const displayValue = stat.displayValue || stat.value || '-';
            
            let rank = null;
            if (statRankings) {
              rank = teamService.getTeamStatRank(teamAbbreviation, statName, statRankings);
            }
            
            teamTotals[statName] = {
              value: displayValue,
              rank: rank
            };
          });
        }
      });
    }
    
    const players = [];
    if (teamStats.results && Array.isArray(teamStats.results)) {
      const playersMap = new Map();
      
      teamStats.results.forEach(category => {
        if (!category?.leaders || !Array.isArray(category.leaders)) return;
        
        category.leaders.forEach(leader => {
          if (!leader?.athlete) return;
          
          const athlete = leader.athlete;
          const playerId = athlete.id;
          
          if (!playerId) return;
          
          if (!playersMap.has(playerId)) {
            playersMap.set(playerId, {
              id: playerId,
              name: formatPlayerNameForDisplay(athlete.fullName || athlete.displayName || athlete.shortName || 'Unknown'),
              position: athlete.position?.abbreviation || athlete.position?.name || '-',
              headshot: athlete.headshot?.href || null,
              stats: {}
            });
          }
          
          const player = playersMap.get(playerId);
          
          if (Array.isArray(leader.statistics)) {
            leader.statistics.forEach(statCategory => {
              if (Array.isArray(statCategory?.stats)) {
                statCategory.stats.forEach(stat => {
                  if (stat?.name) {
                    player.stats[stat.name] = stat.displayValue || stat.value || '-';
                  }
                });
              }
            });
          }
        });
      });
      
      const flattenedPlayers = Array.from(playersMap.values()).map(player => ({
        id: player.id,
        name: player.name,
        position: player.position,
        headshot: player.headshot,
        gamesPlayed: player.stats.gamesPlayed || '-',
        gamesStarted: player.stats.gamesStarted || '-',
        avgMinutes: player.stats.avgMinutes || '-',
        avgPoints: player.stats.avgPoints || '-',
        avgOffensiveRebounds: player.stats.avgOffensiveRebounds || '-',
        avgDefensiveRebounds: player.stats.avgDefensiveRebounds || '-',
        avgRebounds: player.stats.avgRebounds || '-',
        avgAssists: player.stats.avgAssists || '-',
        avgSteals: player.stats.avgSteals || '-',
        avgBlocks: player.stats.avgBlocks || '-',
        avgTurnovers: player.stats.avgTurnovers || '-',
        avgFouls: player.stats.avgFouls || '-',
        assistTurnoverRatio: player.stats.assistTurnoverRatio || '-'
      }));
      
      players.push(...flattenedPlayers);
    }
    
    // Extract team name and city from displayName
    const displayName = teamInfo.displayName || `${teamInfo.location} ${teamInfo.name}`;
    const parts = displayName.split(' ');
    const city = parts.slice(0, -1).join(' ') || teamInfo.location || '';
    const name = parts[parts.length - 1] || displayName;

    sendSuccess(res, {
      team: {
        id: teamInfo.id,
        name: name,
        nameZhCN: getTeamNameZhCn(name), // Chinese team name (Simplified Chinese, zh-CN)
        city: city,
        cityZhCN: getTeamCityZhCn(city), // Chinese city name (Simplified Chinese, zh-CN)
        abbreviation: teamInfo.abbreviation,
        logo: teamInfo.logos?.[0]?.href || null,
        record: teamStats.team?.recordSummary || null,
        standingSummary: teamInfo.standingSummary || null
      },
      teamStats: teamTotals,
      players: players
    }, null, 200, { version: 'v1' });
  })
);

// Get team schedule - WITH PAGINATION
router.get('/nba/teams/:teamAbbreviation/schedule',
  validateTeamAbbreviation,
  validatePagination,
  asyncHandler(async (req, res) => {
    const { teamAbbreviation } = req.params;
    const { seasontype = '2' } = req.query;
    const pagination = req.pagination;
    
    // getTeamSchedule now returns transformed array directly
    const scheduleEvents = await teamService.getTeamSchedule(teamAbbreviation, parseInt(seasontype));
    
    // Ensure it's an array (should always be, but defensive check)
    if (!Array.isArray(scheduleEvents)) {
      throw new NotFoundError('Schedule data');
    }
    
    // Paginate schedule events
    const paginated = paginateArray(scheduleEvents, pagination);
    
    // Return as events array for iOS compatibility (iOS expects { events: [...] })
    sendSuccess(res, {
      events: paginated.data
    }, null, 200, {
      version: 'v1',
      pagination: paginated.meta.pagination
    });
  })
);

// Get team leaders
router.get('/nba/teams/:teamAbbreviation/leaders',
  validateTeamAbbreviation,
  asyncHandler(async (req, res) => {
    const { teamAbbreviation } = req.params;
    const leaders = await teamService.getTeamLeaders(teamAbbreviation);
    sendSuccess(res, leaders, null, 200, { version: 'v1' });
  })
);

// Get recent games - WITH PAGINATION
router.get('/nba/teams/:teamAbbreviation/recent-games',
  validateTeamAbbreviation,
  validatePagination,
  asyncHandler(async (req, res) => {
    const { teamAbbreviation } = req.params;
    const { seasontype = '2' } = req.query;
    const pagination = req.pagination;
    
    const teamInfo = await teamService.getTeamInfo(teamAbbreviation);
    const teamId = teamInfo.id;
    
    const recentGames = await teamService.getRecentGames(teamAbbreviation, teamId, parseInt(seasontype));
    
    // Paginate recent games
    if (recentGames.last5Games && Array.isArray(recentGames.last5Games)) {
      const paginated = paginateArray(recentGames.last5Games, pagination);
      sendSuccess(res, {
        ...recentGames,
        last5Games: paginated.data
      }, null, 200, {
        version: 'v1',
        pagination: paginated.meta.pagination
      });
    } else {
      sendSuccess(res, recentGames, null, 200, { version: 'v1' });
    }
  })
);

// Get today's top performers (GIS-based, with optional Swish Insight for finished games)
const SWISH_INSIGHT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const TODAY_TOP_CACHE_TTL_MS = 2 * 60 * 1000; // 2 min

router.get('/nba/todayTopPerformers',
  asyncHandler(async (req, res) => {
    const { date, insight: insightParam } = req.query;
    const skipInsight = insightParam === 'false' || insightParam === '0';

    const cacheKey = `today_top_performers_${date || 'today'}`;
    const cached = responseCache.get(cacheKey, TODAY_TOP_CACHE_TTL_MS);
    if (cached) {
      return sendSuccess(res, cached, null, 200, { version: 'v1' });
    }

    let result;
    try {
      result = await nbaService.getTodayTopPerformersByGIS(date);
    } catch (error) {
      console.error('Error fetching today top performers:', error.message);
      result = { mode: 'gis', performers: [], hasFinishedGames: false };
    }

    if (result.performers?.length > 0 && result.hasFinishedGames && !skipInsight) {
      const playerService = require('../services/playerService');
      const openaiService = require('../services/openaiService');

      for (const performer of result.performers) {
        const insightCacheKey = `swish_insight_${performer.id}_${performer.competitionId}`;
        let insight = responseCache.get(insightCacheKey, SWISH_INSIGHT_CACHE_TTL_MS);

        if (!insight) {
          try {
            const seasonStats = await playerService.getPlayerCurrentSeasonStats(performer.id);
            insight = await openaiService.generateSwishInsight({
              playerName: performer.name,
              gameStats: performer.stats || {},
              seasonStats: seasonStats?.stats || seasonStats || {}
            });
            responseCache.set(insightCacheKey, insight, SWISH_INSIGHT_CACHE_TTL_MS);
          } catch (aiErr) {
            console.warn(`Swish Insight failed for ${performer.name}:`, aiErr.message);
          }
        }

        if (insight) {
          performer.insight = insight;
        }
      }
    }

    responseCache.set(cacheKey, result, TODAY_TOP_CACHE_TTL_MS);
    sendSuccess(res, result, null, 200, { version: 'v1' });
  })
);

// Get season leaders (top 3 PTS / REB / AST) — ESPN leaders API + seasonMeta for client toggle
router.get('/nba/seasonLeaders',
  asyncHandler(async (req, res) => {
    let seasontype;
    if (req.query.seasontype !== undefined && req.query.seasontype !== '') {
      const n = parseInt(String(req.query.seasontype), 10);
      if (Number.isNaN(n) || (n !== 2 && n !== 3)) {
        throw new ValidationError('seasontype must be 2 (regular) or 3 (postseason)');
      }
      seasontype = n;
    }

    let leaders;
    try {
      leaders = await espnScraperService.getLeaders({ seasontype, limit: 5 });
    } catch (err) {
      if (seasontype !== 3) throw err;
      const postseasonAvailable = await espnScraperService.getPostseasonAvailableCached();
      leaders = {
        points: [],
        rebounds: [],
        assists: [],
        seasonMeta: seasonTypeCache.buildSeasonMeta(3, postseasonAvailable),
      };
    }
    const { seasonMeta, points = [], rebounds = [], assists = [] } = leaders;

    const mapRow = (player, statKey) => ({
      id: player.id,
      name: player.name,
      team: player.team,
      teamNameZhCN: player.teamNameZhCN,
      teamAbbreviation: player.teamAbbreviation || null,
      headshot: player.headshot,
      value: player.value,
      statType: statKey
    });

    sendSuccess(
      res,
      {
        points: points.slice(0, 3).map((p) => mapRow(p, 'avgPoints')),
        rebounds: rebounds.slice(0, 3).map((p) => mapRow(p, 'avgRebounds')),
        assists: assists.slice(0, 3).map((p) => mapRow(p, 'avgAssists')),
        seasonMeta
      },
      null,
      200,
      { version: 'v1' }
    );
  })
);

// Get NBA news - WITH PAGINATION (DEPRECATED: use /api/v2/nba/translated-news)
router.get('/nba/news',
  validatePagination,
  asyncHandler(async (req, res) => {
    res.setHeader('X-Deprecated', 'true');
    res.setHeader('X-Deprecation-Info', 'Use /api/v2/nba/translated-news for translated news');

    const pagination = req.pagination;

    const tweets = await newsService.getShamsTweets();
    // Paginate tweets
    const paginated = paginateArray(tweets, pagination);

    sendSuccess(res, {
      tweets: paginated.data,
      source: 'Twitter/X',
      authors: ['Shams Charania', 'ESPN NBA', 'Marc Stein', 'Chris Haynes'],
      cached: false
    }, null, 200, {
      version: 'v1',
      pagination: paginated.meta.pagination
    });
  })
);

// Get player details
router.get('/nba/players/:playerId',
  validatePlayerId,
  asyncHandler(async (req, res) => {
    const { playerId } = req.params;
    const playerDetails = await playerService.getPlayerDetails(playerId);
    sendSuccess(res, playerDetails, null, 200, { version: 'v1' });
  })
);

// Get player bio
router.get('/nba/players/:playerId/bio',
  validatePlayerId,
  asyncHandler(async (req, res) => {
    const { playerId } = req.params;
    const bio = await playerService.getPlayerBioData(playerId);
    sendSuccess(res, bio, null, 200, { version: 'v1' });
  })
);

// Get current season stats
router.get('/nba/players/:playerId/stats/current',
  validatePlayerId,
  asyncHandler(async (req, res) => {
    const { playerId } = req.params;
    const currentStats = await playerService.getPlayerCurrentSeasonStats(playerId);
    sendSuccess(res, currentStats, null, 200, { version: 'v1' });
  })
);

// Get regular season stats
router.get('/nba/players/:playerId/stats',
  validatePlayerId,
  asyncHandler(async (req, res) => {
    const { playerId } = req.params;
    const regularStats = await playerService.getPlayerRegularSeasonStats(playerId);
    sendSuccess(res, regularStats, null, 200, { version: 'v1' });
  })
);

// Get advanced statistics
router.get('/nba/players/:playerId/stats/advanced',
  validatePlayerId,
  asyncHandler(async (req, res) => {
    const { playerId } = req.params;
    const advancedStats = await playerService.getPlayerAdvancedStatsData(playerId);
    sendSuccess(res, advancedStats, null, 200, { version: 'v1' });
  })
);

// Get last 5 games
router.get('/nba/players/:playerId/gamelog',
  validatePlayerId,
  asyncHandler(async (req, res) => {
    const { playerId } = req.params;
    const last5Games = await playerService.getPlayerLast5Games(playerId);
    sendSuccess(res, last5Games, null, 200, { version: 'v1' });
  })
);

// Register Expo push token (Swish mobile app)
router.post('/notifications/register',
  asyncHandler(async (req, res) => {
    const { token, platform } = req.body || {};
    if (!token || typeof token !== 'string' || token.length < 25 || token.length > 512) {
      throw new ValidationError('Missing or invalid push token');
    }
    await pushNotificationService.registerToken(token, typeof platform === 'string' ? platform : '');
    sendSuccess(res, { registered: true }, null, 200, { version: 'v1' });
  })
);

module.exports = router;

