const express = require('express');
const nbaService = require('./services/nbaService');
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

    // Get today's games
    this.app.get('/api/nba/games/today', async (req, res) => {
      try {
        const { leagueId = '00' } = req.query;
        const scoreboardData = await nbaService.getTodaysScoreboard(leagueId);
        const transformed = gameTransformer.transformScoreboard(scoreboardData);
        res.json(transformed);
      } catch (error) {
        console.error('Error fetching today\'s games:', error);
        res.status(500).json({
          error: 'Failed to fetch today\'s games',
          message: error.message
        });
      }
    });

    // Get game details by gameId
    this.app.get('/api/nba/games/:gameId', async (req, res) => {
      try {
        const { gameId } = req.params;
        const gameData = await nbaService.getGameDetails(gameId);
        const transformed = gameTransformer.transformGame(gameData);
        res.json(transformed);
      } catch (error) {
        console.error('Error fetching game details:', error);
        res.status(500).json({
          error: 'Failed to fetch game details',
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

