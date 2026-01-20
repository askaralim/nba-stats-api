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

// Response cache for endpoint-level caching (reusable across all endpoints)
// Usage: responseCache.get(cacheKey, ttlMs) / responseCache.set(cacheKey, data, ttlMs)
// Example: const cached = responseCache.get(`game_${gameId}`, 60 * 1000); // 1 min cache
const responseCache = require('../services/responseCache');

// Apply pagination middleware to all list endpoints
router.use('/nba/games/today', paginationMiddleware);
router.use('/nba/stats/players', paginationMiddleware);
router.use('/nba/news', paginationMiddleware);
router.use('/nba/teams/:teamAbbreviation/schedule', paginationMiddleware);
router.use('/nba/teams/:teamAbbreviation/recent-games', paginationMiddleware);

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
    
    const [gameData, summaryData] = await Promise.all([
      nbaService.getGameDetails(gameId),
      nbaService.getGameSummary(gameId).catch(() => null)
    ]);
    const transformed = gameTransformer.transformGame(gameData);
    
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

// Get AI game summary - Strict rate limit
router.get('/nba/games/:gameId/summary',
  validateGameId,
  strictRateLimiter,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    
    // Check response cache first (5 minute TTL for finished games)
    const cacheKey = `game_summary_${gameId}`;
    const cachedResponse = responseCache.get(cacheKey, 5 * 60 * 1000); // 5 minutes
    
    if (cachedResponse) {
      return sendSuccess(res, cachedResponse, null, 200, { version: 'v1' });
    }
    
    const gameData = await nbaService.getGameDetails(gameId);
    const transformed = gameTransformer.transformGame(gameData);
    
    if (transformed.gameStatus !== 3) {
      throw new ValidationError('AI summary is only available for finished games');
    }
    
    const summaryData = await nbaService.getGameSummary(gameId).catch(() => null);
    if (!summaryData?.boxscore) {
      throw new NotFoundError('Game boxscore');
    }
    
    const boxscore = gameTransformer.transformBoxscore(summaryData.boxscore);
    if (!boxscore) {
      throw new NotFoundError('Game boxscore');
    }
    
    let teamStatistics = boxscore.teamStatistics;
    if (!teamStatistics && boxscore.teams && boxscore.teams.length >= 2) {
      teamStatistics = gameTransformer.extractTeamStatistics(summaryData.boxscore, boxscore.teams);
      if (teamStatistics) {
        boxscore.teamStatistics = teamStatistics;
      }
    }
    
    if (!teamStatistics) {
      throw new NotFoundError('Team statistics');
    }
    
    const gameSummaryCache = require('../services/gameSummaryCache');
    const openaiService = require('../services/openaiService');
    
    let aiSummary = gameSummaryCache.get(gameId);
    
    if (!aiSummary) {
      const gameFacts = gameTransformer.computeGameFacts(
        transformed,
        summaryData.boxscore,
        teamStatistics
      );
      
      if (gameFacts) {
        try {
          const summaryText = await openaiService.generateGameSummary(gameFacts);
          gameSummaryCache.set(gameId, summaryText, 'ai');
          aiSummary = {
            summary: summaryText,
            source: 'ai',
            generatedAt: new Date().toISOString()
          };
        } catch (aiError) {
          console.error('AI summary generation failed:', aiError.message);
          if (boxscore.gameStory) {
            const fallbackSummary = boxscore.gameStory.summary;
            gameSummaryCache.set(gameId, fallbackSummary, 'fallback');
            aiSummary = {
              summary: fallbackSummary,
              source: 'fallback',
              generatedAt: new Date().toISOString()
            };
          } else {
            throw new ExternalAPIError('AI summary generation failed and no fallback available');
          }
        }
      } else if (boxscore.gameStory) {
        const fallbackSummary = boxscore.gameStory.summary;
        gameSummaryCache.set(gameId, fallbackSummary, 'fallback');
        aiSummary = {
          summary: fallbackSummary,
          source: 'fallback',
          generatedAt: new Date().toISOString()
        };
      } else {
        throw new ExternalAPIError('Unable to compute game facts and no fallback available');
      }
    }
    
    // Cache the response for 5 minutes
    responseCache.set(cacheKey, aiSummary, 5 * 60 * 1000);
    
    sendSuccess(res, aiSummary, null, 200, { version: 'v1' });
  })
);

// Get ESPN player stats - WITH PAGINATION
router.get('/nba/stats/players',
  validatePagination,
  asyncHandler(async (req, res) => {
    const {
      season = '2026|2',
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

// Get NBA standings
router.get('/nba/standings',
  asyncHandler(async (req, res) => {
    const {
      season = '2026',
      seasonType = '2'
    } = req.query;
    
    const options = {
      season: parseInt(season) || 2026,
      seasonType: parseInt(seasonType) || 2
    };
    
    const standingsData = await standingsService.getStandings(options);
    sendSuccess(res, standingsData, null, 200, { version: 'v1' });
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
              name: athlete.fullName || athlete.displayName || athlete.shortName || 'Unknown',
              position: athlete.position?.abbreviation || athlete.position?.name || '-',
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
    
    sendSuccess(res, {
      team: {
        id: teamInfo.id,
        name: teamInfo.displayName || `${teamInfo.location} ${teamInfo.name}`,
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
    
    const scheduleData = await teamService.getTeamSchedule(teamAbbreviation, parseInt(seasontype));
    
    // Paginate schedule if it's an array
    if (Array.isArray(scheduleData)) {
      const paginated = paginateArray(scheduleData, pagination);
      sendSuccess(res, paginated.data, null, 200, {
        version: 'v1',
        pagination: paginated.meta.pagination
      });
    } else {
      sendSuccess(res, scheduleData, null, 200, { version: 'v1' });
    }
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

// Get today's top performers (from scoreboard leaders)
router.get('/nba/todayTopPerformers',
  asyncHandler(async (req, res) => {
    const { date } = req.query;
    
    let todayTopPerformers;
    try {
      todayTopPerformers = await nbaService.getTodayTopPerformers(date);
    } catch (error) {
      console.error('Error fetching today top performers:', error.message);
      todayTopPerformers = {
        points: [],
        rebounds: [],
        assists: []
      };
    }
    
    sendSuccess(res, todayTopPerformers, null, 200, { version: 'v1' });
  })
);

// Get season leaders (top 3 in points, rebounds, assists)
router.get('/nba/seasonLeaders',
  asyncHandler(async (req, res) => {
    const seasonLeaders = await espnScraperService.getPlayerStats({
      season: '2026|2',
      limit: 100,
      sort: 'offensive.avgPoints:desc'
    });
    
    const topSeasonLeaders = {
      points: (seasonLeaders.topPlayersByStat?.avgPoints?.players || []).slice(0, 3).map(player => ({
        id: player.id,
        name: player.name,
        team: player.team,
        teamAbbreviation: player.teamLogo ? player.teamLogo.split('/').pop().split('.')[0].toUpperCase() : null,
        headshot: player.headshot,
        value: player.stats?.avgPoints?.displayValue || player.stats?.avgPoints?.value || '-',
        statType: 'avgPoints'
      })),
      rebounds: (seasonLeaders.topPlayersByStat?.avgRebounds?.players || []).slice(0, 3).map(player => ({
        id: player.id,
        name: player.name,
        team: player.team,
        teamAbbreviation: player.teamLogo ? player.teamLogo.split('/').pop().split('.')[0].toUpperCase() : null,
        headshot: player.headshot,
        value: player.stats?.avgRebounds?.displayValue || player.stats?.avgRebounds?.value || '-',
        statType: 'avgRebounds'
      })),
      assists: (seasonLeaders.topPlayersByStat?.avgAssists?.players || []).slice(0, 3).map(player => ({
        id: player.id,
        name: player.name,
        team: player.team,
        teamAbbreviation: player.teamLogo ? player.teamLogo.split('/').pop().split('.')[0].toUpperCase() : null,
        headshot: player.headshot,
        value: player.stats?.avgAssists?.displayValue || player.stats?.avgAssists?.value || '-',
        statType: 'avgAssists'
      }))
    };
    
    sendSuccess(res, topSeasonLeaders, null, 200, { version: 'v1' });
  })
);

// Get NBA news - WITH PAGINATION
router.get('/nba/news',
  validatePagination,
  asyncHandler(async (req, res) => {
    const forceRefresh = req.query.refresh === 'true';
    const pagination = req.pagination;
    
    const tweets = await newsService.getShamsTweets(forceRefresh);
    
    // Paginate tweets
    const paginated = paginateArray(tweets, pagination);
    
    sendSuccess(res, {
      tweets: paginated.data,
      source: 'Twitter/X',
      authors: ['Shams Charania', 'ESPN NBA', 'Marc Stein', 'Chris Haynes'],
      cached: !forceRefresh
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

module.exports = router;

