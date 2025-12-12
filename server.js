const express = require('express');
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
        const { date } = req.query;
        const scoreboardData = date 
          ? await nbaService.getScoreboard(date)
          : await nbaService.getTodaysScoreboard();
        const transformed = gameTransformer.transformScoreboard(scoreboardData);
        res.json(transformed);
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
        
        // Add boxscore data if available
        if (summaryData?.boxscore) {
          transformed.boxscore = gameTransformer.transformBoxscore(summaryData.boxscore);
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

    // Get team details (info + statistics)
    this.app.get('/api/nba/teams/:teamAbbreviation', async (req, res) => {
      try {
        const { teamAbbreviation } = req.params;
        
        // Fetch both team info and statistics in parallel
        const [teamInfo, teamStats] = await Promise.all([
          teamService.getTeamInfo(teamAbbreviation),
          teamService.getTeamStatistics(teamAbbreviation)
        ]);

        res.json({
          team: teamInfo,
          statistics: teamStats
        });
      } catch (error) {
        console.error('Error fetching team details:', error);
        res.status(500).json({
          error: 'Failed to fetch team details',
          message: error.message
        });
      }
    });

    // Get NBA news (Shams Charania tweets)
    this.app.get('/api/nba/news', async (req, res) => {
      try {
        const tweets = await newsService.getShamsTweets();
        res.json({
          tweets: tweets,
          source: 'Twitter/X',
          author: 'Shams Charania'
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
    this.app.get('/api/nba/players/:playerId/bio', async (req, res) => {
      try {
        const { playerId } = req.params;
        const bio = await playerService.getPlayerBio(playerId);
        res.json(bio);
      } catch (error) {
        console.error('Error fetching player bio:', error);
        res.status(500).json({
          error: 'Failed to fetch player bio',
          message: error.message
        });
      }
    });

    // Get player statistics
    this.app.get('/api/nba/players/:playerId/stats', async (req, res) => {
      try {
        const { playerId } = req.params;
        const stats = await playerService.getPlayerStats(playerId);
        res.json(stats);
      } catch (error) {
        console.error('Error fetching player stats:', error);
        res.status(500).json({
          error: 'Failed to fetch player stats',
          message: error.message
        });
      }
    });

    // Get player advanced statistics
    this.app.get('/api/nba/players/:playerId/stats/advanced', async (req, res) => {
      try {
        const { playerId } = req.params;
        const advancedStats = await playerService.getPlayerAdvancedStats(playerId);
        res.json(advancedStats);
      } catch (error) {
        console.error('Error fetching player advanced stats:', error);
        res.status(500).json({
          error: 'Failed to fetch player advanced stats',
          message: error.message
        });
      }
    });

    // Get player basic information
    this.app.get('/api/nba/players/:playerId', async (req, res) => {
      try {
        const { playerId } = req.params;
        const playerInfo = await playerService.getPlayerInfo(playerId);
        res.json(playerInfo);
      } catch (error) {
        console.error('Error fetching player info:', error);
        res.status(500).json({
          error: 'Failed to fetch player info',
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

