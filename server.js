const express = require('express');
const cron = require('node-cron');
const nbaService = require('./services/nbaService');
const espnScraperService = require('./services/espnScraperService');
const standingsService = require('./services/standingsService');
const teamService = require('./services/teamService');
const newsService = require('./services/newsService');
const playerService = require('./services/playerService');
const gameTransformer = require('./utils/gameTransformer');

class WebServer {
  constructor(port = 3000) {
    this.app = express();
    this.port = port;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupCronJobs();
  }

  setupMiddleware() {
    // Parse JSON bodies
    this.app.use(express.json());
    
    // Parse URL-encoded bodies
    this.app.use(express.urlencoded({ extended: true }));

    // CORS middleware for frontend
    const corsOrigin = process.env.CORS_ORIGIN || '*';
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', corsOrigin);
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
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
    standingsService.getStandings({ season: 2026, seasonType: 2 }).catch(err => {
      console.error('  ✗ Failed to fetch standings on startup:', err);
    });

    // 3. All Team Info - Static data, used across multiple pages
    console.log('  → Pre-fetching all team info (30 teams)...');
    teamService.prefetchAllTeamInfo().catch(err => {
      console.error('  ✗ Failed to pre-fetch team info on startup:', err);
    });

    // 4. News - Expensive operation, frequently accessed
    console.log('  → Pre-fetching news...');
    newsService.getShamsTweets().catch(err => {
      console.error('  ✗ Failed to fetch news on startup:', err);
    });
    

    console.log('Startup pre-fetch initiated (non-blocking)');

    // ============================================
    // SCHEDULED CRON JOBS
    // ============================================
    
    // News: Every 5 minutes (expensive Puppeteer operation)
    cron.schedule('*/5 * * * *', async () => {
      console.log('[Cron] Fetching news (scheduled every 5 minutes)...');
      try {
        await newsService.getShamsTweets(true); // Force refresh
        console.log('[Cron] ✓ News fetch completed successfully');
      } catch (error) {
        console.error('[Cron] ✗ Failed to fetch news:', error);
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
        await standingsService.getStandings({ season: 2026, seasonType: 2 });
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

    console.log('Cron jobs initialized:');
    console.log('  - News: every 5 minutes');
    console.log('  - Today\'s Games: every 2 minutes');
    console.log('  - Standings: every 30 minutes');
    console.log('  - Team Info: every 30 minutes');
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', message: 'Server is running' });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({ message: 'Welcome to NBA Stats Demo API' });
    });

    // Get games for a specific date (defaults to today)
    this.app.get('/api/nba/games/today', async (req, res) => {
      try {
        const { date, featured, closeGames, overtime, marquee } = req.query;
        const scoreboardData = date 
          ? await nbaService.getScoreboard(date)
          : await nbaService.getTodaysScoreboard();
        // Minimize data for GamesToday page - only return what's needed
        const transformed = gameTransformer.transformScoreboard(scoreboardData, true);
        
        // Apply filters if specified (backend filtering for iOS compatibility)
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
        
        // Sort games by priority (always done on backend)
        const sortedGames = gameTransformer.sortGamesByPriority(filteredGames);
        
        // If featured=true, identify featured games and sort by priority
        if (featured === 'true') {
          const { featured: featuredGames, other: otherGames } = 
            gameTransformer.identifyFeaturedGames(sortedGames);
          
          res.json({
            ...transformed,
            games: sortedGames, // All games sorted by priority
            featured: featuredGames,
            other: otherGames
          });
        } else {
          res.json({
            ...transformed,
            games: sortedGames
          });
        }
      } catch (error) {
        console.error('Error fetching games:', error);
        res.status(500).json({
          error: 'Failed to fetch games',
          message: error.message
        });
      }
    });

    // Get game details by gameId
    this.app.get('/api/nba/games/:gameId', async (req, res) => {
      try {
        const { gameId } = req.params;
        const [gameData, summaryData] = await Promise.all([
          nbaService.getGameDetails(gameId),
          nbaService.getGameSummary(gameId).catch(() => null) // Don't fail if summary fails
        ]);
        const transformed = gameTransformer.transformGame(gameData);
        
        // Add boxscore data if available (includes pre-calculated top performers)
        if (summaryData?.boxscore) {
          transformed.boxscore = gameTransformer.transformBoxscore(summaryData.boxscore);
        }

        // Add season series data if available
        if (summaryData) {
          // Debug: Log available keys in summaryData to help identify structure
          if (process.env.NODE_ENV === 'development') {
            console.log('[DEBUG] Summary API keys:', Object.keys(summaryData));
            if (summaryData.seasonSeries) {
              console.log('[DEBUG] seasonSeries found:', JSON.stringify(summaryData.seasonSeries).substring(0, 200));
            }
            if (summaryData.injuryReport) {
              console.log('[DEBUG] injuryReport found:', JSON.stringify(summaryData.injuryReport).substring(0, 200));
            }
          }
          
          const seasonSeries = gameTransformer.transformSeasonSeries(summaryData, transformed);
          if (seasonSeries) {
            transformed.seasonSeries = seasonSeries;
          }

          // Add injuries data if available
          const injuries = gameTransformer.transformInjuries(summaryData, transformed);
          if (injuries) {
            transformed.injuries = injuries;
          }
        }

        res.json(transformed);
      } catch (error) {
        console.error('Error fetching game details:', error);
        res.status(500).json({
          error: 'Failed to fetch game details',
          message: error.message
        });
      }
    });

    // Get AI game summary (async, separate endpoint)
    this.app.get('/api/nba/games/:gameId/summary', async (req, res) => {
      try {
        const { gameId } = req.params;
        
        // Check if game is finished
        const gameData = await nbaService.getGameDetails(gameId);
        const transformed = gameTransformer.transformGame(gameData);
        
        if (transformed.gameStatus !== 3) {
          return res.status(400).json({
            error: 'Game not finished',
            message: 'AI summary is only available for finished games'
          });
        }

        // Get boxscore data for facts computation
        const summaryData = await nbaService.getGameSummary(gameId).catch(() => null);
        if (!summaryData?.boxscore) {
          return res.status(404).json({
            error: 'Boxscore not available',
            message: 'Game boxscore data is required for summary generation'
          });
        }

        const boxscore = gameTransformer.transformBoxscore(summaryData.boxscore);
        if (!boxscore?.teamStatistics) {
          return res.status(404).json({
            error: 'Team statistics not available',
            message: 'Team statistics are required for summary generation'
          });
        }

        const gameSummaryCache = require('./services/gameSummaryCache');
        const openaiService = require('./services/openaiService');
        
        // Check cache first
        let aiSummary = gameSummaryCache.get(gameId);
        
        if (!aiSummary) {
          // Compute game facts (deterministic)
          const gameFacts = gameTransformer.computeGameFacts(
            transformed,
            summaryData.boxscore,
            boxscore.teamStatistics
          );

          if (gameFacts) {
            try {
              // Generate AI summary
              const summaryText = await openaiService.generateGameSummary(gameFacts);
              gameSummaryCache.set(gameId, summaryText, 'ai');
              aiSummary = {
                summary: summaryText,
                source: 'ai',
                generatedAt: new Date().toISOString()
              };
            } catch (aiError) {
              console.error('AI summary generation failed:', aiError.message);
              // Fallback to algorithmic summary
              if (boxscore.gameStory) {
                const fallbackSummary = boxscore.gameStory.summary;
                gameSummaryCache.set(gameId, fallbackSummary, 'fallback');
                aiSummary = {
                  summary: fallbackSummary,
                  source: 'fallback',
                  generatedAt: new Date().toISOString()
                };
              } else {
                return res.status(500).json({
                  error: 'Summary generation failed',
                  message: 'AI summary generation failed and no fallback available'
                });
              }
            }
          } else if (boxscore.gameStory) {
            // Use algorithmic summary as fallback
            const fallbackSummary = boxscore.gameStory.summary;
            gameSummaryCache.set(gameId, fallbackSummary, 'fallback');
            aiSummary = {
              summary: fallbackSummary,
              source: 'fallback',
              generatedAt: new Date().toISOString()
            };
          } else {
            return res.status(500).json({
              error: 'Summary generation failed',
              message: 'Unable to compute game facts and no fallback available'
            });
          }
        }

        res.json(aiSummary);
      } catch (error) {
        console.error('Error fetching game summary:', error);
        res.status(500).json({
          error: 'Failed to fetch game summary',
          message: error.message
        });
      }
    });

    // Get ESPN player stats (via API)
    this.app.get('/api/nba/stats/players', async (req, res) => {
      try {
        const {
          season = '2026|2',
          position = 'all-positions',
          conference = '0', // Not used in ESPN API but kept for compatibility
          page = '1',
          limit = '50',
          sort = 'offensive.avgPoints:desc'
        } = req.query;

        const options = {
          season: season.trim(),
          position: position.trim(),
          conference: conference.trim(),
          page: parseInt(page) || 1,
          limit: parseInt(limit) || 50,
          sort: sort.trim()
        };

        const statsData = await espnScraperService.getPlayerStats(options);
        res.json(statsData);
      } catch (error) {
        console.error('Error fetching ESPN player stats:', error);
        res.status(500).json({
          error: 'Failed to fetch player stats',
          message: error.message
        });
      }
    });

    // Get NBA standings
    this.app.get('/api/nba/standings', async (req, res) => {
      try {
        const {
          season = '2026',
          seasonType = '2'
        } = req.query;

        const options = {
          season: parseInt(season) || 2026,
          seasonType: parseInt(seasonType) || 2
        };

        const standingsData = await standingsService.getStandings(options);
        res.json(standingsData);
      } catch (error) {
        console.error('Error fetching standings:', error);
        res.status(500).json({
          error: 'Failed to fetch standings',
          message: error.message
        });
      }
    });

    // Get team details (info + essential statistics only)
    this.app.get('/api/nba/teams/:teamAbbreviation', async (req, res) => {
      try {
        const { teamAbbreviation } = req.params;
        
        // Fetch team info, statistics, and rankings
        const [teamInfo, teamStats, statRankings] = await Promise.all([
          teamService.getTeamInfo(teamAbbreviation),
          teamService.getTeamStatistics(teamAbbreviation),
          teamService.getAllTeamsStatRankings().catch(() => null) // Don't fail if rankings fail
        ]);

        // Extract only essential team statistics with rankings
        const teamTotals = {};
        if (teamStats.teamTotals && Array.isArray(teamStats.teamTotals)) {
          teamStats.teamTotals.forEach(category => {
            if (Array.isArray(category.stats)) {
              category.stats.forEach(stat => {
                const statName = stat.name;
                const displayValue = stat.displayValue || stat.value || '-';
                
                // Get ranking if available
                let rank = null;
                if (statRankings) {
                  rank = teamService.getTeamStatRank(teamAbbreviation, statName, statRankings);
                }
                
                teamTotals[statName] = {
                  value: displayValue,
                  rank: rank // 1-based rank, or null if not available
                };
              });
            }
          });
        }

        // Extract player statistics (simplified)
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
              
              // Extract stats from leader
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
          
          // Flatten player stats for easier frontend access
          const flattenedPlayers = Array.from(playersMap.values()).map(player => ({
            id: player.id,
            name: player.name,
            position: player.position,
            // Flatten stats to top level
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

        // Return only what frontend needs
        res.json({
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
        });
      } catch (error) {
        console.error('Error fetching team details:', error);
        res.status(500).json({
          error: 'Failed to fetch team details',
          message: error.message
        });
      }
    });

    // Get team schedule
    this.app.get('/api/nba/teams/:teamAbbreviation/schedule', async (req, res) => {
      try {
        const { teamAbbreviation } = req.params;
        const { seasontype = '2' } = req.query;
        
        const scheduleData = await teamService.getTeamSchedule(teamAbbreviation, parseInt(seasontype));
        res.json(scheduleData);
      } catch (error) {
        console.error('Error fetching team schedule:', error);
        res.status(500).json({
          error: 'Failed to fetch team schedule',
          message: error.message
        });
      }
    });

    // Get team leaders (transformed - offense and defense)
    this.app.get('/api/nba/teams/:teamAbbreviation/leaders', async (req, res) => {
      try {
        const { teamAbbreviation } = req.params;
        const leaders = await teamService.getTeamLeaders(teamAbbreviation);
        res.json(leaders);
      } catch (error) {
        console.error('Error fetching team leaders:', error);
        res.status(500).json({
          error: 'Failed to fetch team leaders',
          message: error.message
        });
      }
    });

    // Get recent games (last 5 completed, next 3 upcoming)
    this.app.get('/api/nba/teams/:teamAbbreviation/recent-games', async (req, res) => {
      try {
        const { teamAbbreviation } = req.params;
        const { seasontype = '2' } = req.query;
        
        // Get team ID first
        const teamInfo = await teamService.getTeamInfo(teamAbbreviation);
        const teamId = teamInfo.id;
        
        const recentGames = await teamService.getRecentGames(teamAbbreviation, teamId, parseInt(seasontype));
        res.json(recentGames);
      } catch (error) {
        console.error('Error fetching recent games:', error);
        res.status(500).json({
          error: 'Failed to fetch recent games',
          message: error.message
        });
      }
    });

    // Get home page data (today's top performers and season leaders)
    this.app.get('/api/nba/home', async (req, res) => {
      try {
        const { date } = req.query;
        
        // Get today's top performers from completed games
        const todayTopPerformers = await nbaService.getTodayTopPerformers(date);
        
        // Get top 3 season leaders (using existing player stats endpoint logic)
        const seasonLeaders = await espnScraperService.getPlayerStats({
          season: '2026|2',
          limit: 100,
          sort: 'offensive.avgPoints:desc'
        });
        
        // Extract top 3 for each category from topPlayersByStat
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

        res.json({
          todayTopPerformers: todayTopPerformers,
          seasonLeaders: topSeasonLeaders
        });
      } catch (error) {
        console.error('Error fetching home page data:', error);
        res.status(500).json({
          error: 'Failed to fetch home page data',
          message: error.message
        });
      }
    });

    // Get NBA news (tweets from multiple NBA news accounts)
    // Returns cached data immediately (refreshed by cron job every 5 minutes)
    this.app.get('/api/nba/news', async (req, res) => {
      try {
        // Check if client wants to force refresh
        const forceRefresh = req.query.refresh === 'true';
        
        const tweets = await newsService.getShamsTweets(forceRefresh);
        res.json({
          tweets: tweets,
          source: 'Twitter/X',
          authors: ['Shams Charania', 'ESPN NBA', 'Marc Stein', 'Chris Haynes'],
          cached: !forceRefresh // Indicate if data is from cache
        });
      } catch (error) {
        console.error('Error fetching news:', error);
        res.status(500).json({
          error: 'Failed to fetch news',
          message: error.message
        });
      }
    });

    // Get player bio information
    // Get player details (clean, pre-processed)
    this.app.get('/api/nba/players/:playerId', async (req, res) => {
      try {
        const { playerId } = req.params;
        const playerDetails = await playerService.getPlayerDetails(playerId);
        res.json(playerDetails);
      } catch (error) {
        console.error('Error fetching player details:', error);
        res.status(500).json({
          error: 'Failed to fetch player details',
          message: error.message
        });
      }
    });

    // Get player bio (clean, without teamHistory)
    this.app.get('/api/nba/players/:playerId/bio', async (req, res) => {
      try {
        const { playerId } = req.params;
        const bio = await playerService.getPlayerBioData(playerId);
        res.json(bio);
      } catch (error) {
        console.error('Error fetching player bio:', error);
        res.status(500).json({
          error: 'Failed to fetch player bio',
          message: error.message
        });
      }
    });

    // Get current season stats (flattened)
    this.app.get('/api/nba/players/:playerId/stats/current', async (req, res) => {
      try {
        const { playerId } = req.params;
        const currentStats = await playerService.getPlayerCurrentSeasonStats(playerId);
        res.json(currentStats);
      } catch (error) {
        console.error('Error fetching current season stats:', error);
        res.status(500).json({
          error: 'Failed to fetch current season stats',
          message: error.message
        });
      }
    });

    // Get regular season stats (with labels)
    this.app.get('/api/nba/players/:playerId/stats', async (req, res) => {
      try {
        const { playerId } = req.params;
        const regularStats = await playerService.getPlayerRegularSeasonStats(playerId);
        res.json(regularStats);
      } catch (error) {
        console.error('Error fetching regular season stats:', error);
        res.status(500).json({
          error: 'Failed to fetch regular season stats',
          message: error.message
        });
      }
    });

    // Get advanced statistics (with labels and glossary)
    this.app.get('/api/nba/players/:playerId/stats/advanced', async (req, res) => {
      try {
        const { playerId } = req.params;
        const advancedStats = await playerService.getPlayerAdvancedStatsData(playerId);
        res.json(advancedStats);
      } catch (error) {
        console.error('Error fetching player advanced stats:', error);
        res.status(500).json({
          error: 'Failed to fetch player advanced stats',
          message: error.message
        });
      }
    });

    // Get last 5 games (flattened)
    this.app.get('/api/nba/players/:playerId/gamelog', async (req, res) => {
      try {
        const { playerId } = req.params;
        const last5Games = await playerService.getPlayerLast5Games(playerId);
        res.json(last5Games);
      } catch (error) {
        console.error('Error fetching player game log:', error);
        res.status(500).json({
          error: 'Failed to fetch player game log',
          message: error.message
        });
      }
    });
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

