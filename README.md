# NBA Stats API

RESTful API backend for NBA statistics application using ESPN APIs.

## Features

- **Games Scoreboard**: Get games for any date with live scores and status
- **Game Details**: Detailed game information with boxscore and player statistics
- **Player Statistics**: Season statistics by category (points, assists, rebounds, etc.)
- **Team Standings**: Current NBA standings by conference
- **Caching**: In-memory caching for improved performance and reduced API calls

## Tech Stack

- Node.js
- Express.js
- ESPN API (Scoreboard, Summary, Player Stats, Standings)

## Getting Started

### Installation

```bash
npm install
```

### Environment Variables

**Quick Setup:**

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. The `.env` file is already configured with default values for local development.

**Manual Setup:**

If you prefer to create `.env` manually, use the following content:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# CORS Configuration
# For local development, use http://localhost:5173 (Vite default port)
CORS_ORIGIN=http://localhost:5173
```

**Environment Variables:**
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (development/production)
- `CORS_ORIGIN`: Frontend URL for CORS (required for production)

**Note**: 
- The `.env` file is gitignored and won't be committed to the repository
- The project uses `dotenv` to automatically load environment variables from `.env` file
- For production (Railway), set environment variables in the Railway dashboard instead of using `.env`

### Running

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

Server runs on `http://localhost:3000` (or PORT from .env)

## API Endpoints

### Get Games for a Date
```
GET /api/nba/games/today?date=20251210
```

**Query Parameters:**
- `date` (optional): Date in YYYYMMDD format (defaults to today)

**Response:**
```json
{
  "date": "2025-12-10",
  "totalGames": 5,
  "games": [
    {
      "gameId": "401809835",
      "gameStatus": 3,
      "gameStatusText": "Final",
      "homeTeam": {...},
      "awayTeam": {...},
      "gameLeaders": {...}
    }
  ]
}
```

### Get Game Details with Boxscore
```
GET /api/nba/games/:gameId
```

**Response:**
```json
{
  "gameId": "401809835",
  "gameStatus": 3,
  "homeTeam": {...},
  "awayTeam": {...},
  "boxscore": {
    "teams": [
      {
        "teamName": "Oklahoma City Thunder",
        "starters": [...],
        "bench": [...]
      }
    ]
  }
}
```

### Get Player Statistics
```
GET /api/nba/stats/players?season=2026|2&position=all-positions&page=1&limit=50&sort=offensive.avgPoints:desc
```

**Query Parameters:**
- `season`: Season in format "YYYY|type" (e.g., "2026|2" for regular season, "2026|3" for postseason)
- `position`: Position filter (all-positions, guard, forward, center)
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50)
- `sort`: Sort field (e.g., "offensive.avgPoints:desc")

### Get Team Standings
```
GET /api/nba/standings?season=2026&seasonType=2
```

**Query Parameters:**
- `season`: Season year (default: 2026)
- `seasonType`: Season type (2 = Regular Season, 3 = Postseason)

**Response:**
```json
{
  "standings": {
    "East": [...],
    "West": [...]
  }
}
```

## Deployment

### Railway Deployment

1. **Install Railway CLI** (optional but recommended):
   ```bash
   npm i -g @railway/cli
   ```

2. **Deploy via Railway Dashboard**:
   - Go to [railway.app](https://railway.app)
   - Click "New Project"
   - Select "Deploy from GitHub repo" (connect your GitHub account)
   - Select the `nba-stats-api` directory
   - Railway will automatically detect Node.js and deploy

3. **Set Environment Variables** in Railway:
   - `CORS_ORIGIN`: Your frontend URL (e.g., `https://your-frontend.vercel.app`)
   - `NODE_ENV`: `production` (optional, Railway sets this automatically)
   - `PORT`: Railway automatically provides this (no need to set manually)

4. **Get Your API URL**:
   - Railway will provide a URL like: `https://your-app-name.up.railway.app`
   - Use this URL in your frontend's `VITE_API_URL` environment variable

### Other Deployment Options

The backend can also be deployed to:
- Heroku
- Render
- AWS EC2
- DigitalOcean
- Any Node.js hosting platform

**Important**: Set the `CORS_ORIGIN` environment variable to your frontend URL in production.

