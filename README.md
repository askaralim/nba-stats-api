# NBA Stats API

RESTful API backend for NBA statistics application using ESPN APIs. Built with an **API-first architecture** where all data transformation and processing happens on the backend, providing clean, pre-processed data to the frontend.

## Features

- **API-First Design**: All data extraction, transformation, and caching centralized on backend
- **Games Scoreboard**: Get games for any date with live scores, status, and featured games
- **Game Details**: Detailed game information with boxscore, player statistics, and pre-calculated top performers
- **Player Statistics**: Season statistics with pre-calculated top players by category
- **Team Information**: Team details, leaders, recent games, and schedules
- **Team Standings**: Current NBA standings with pre-formatted display values
- **Home Dashboard**: Aggregated data for home page (top performers, season leaders)
- **News Feed**: NBA news from Twitter/X
- **Caching**: In-memory caching for improved performance and reduced API calls

## Tech Stack

- Node.js
- Express.js
- ESPN API (Scoreboard, Summary, Player Stats, Standings, Team Info)
- In-memory caching with Map-based cache

## Architecture

### API-First Pattern

This backend follows an **API-first design pattern**:

1. **Data Fetching**: Backend fetches raw data from ESPN APIs
2. **Data Transformation**: All data extraction, flattening, and processing happens on backend
3. **Pre-calculation**: Derived data (top performers, leaders, featured games) is pre-calculated
4. **Clean Responses**: Frontend receives only the data it needs, in a clean, consistent format
5. **Caching**: Responses are cached to reduce redundant API calls

### Benefits

- **Simplified Frontend**: Frontend only consumes clean data, no complex processing
- **Better Performance**: Calculations done once on backend, cached for multiple requests
- **Maintainability**: All data logic centralized in one place
- **iOS-Ready**: Clean API structure makes it easy to build mobile apps
- **Consistency**: All endpoints follow the same pattern

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

### Games

#### Get Games for a Date
```
GET /api/nba/games/today?date=20251210&featured=true
```

**Query Parameters:**
- `date` (optional): Date in YYYYMMDD format (defaults to today)
- `featured` (optional): Set to `true` to get featured games separated from other games

**Response (without featured):**
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
      "awayTeam": {...}
    }
  ]
}
```

**Response (with featured=true):**
```json
{
  "date": "2025-12-10",
  "totalGames": 5,
  "games": [...],
  "featured": [
    {
      "gameId": "401809835",
      "featuredReason": "overtime",
      ...
    }
  ],
  "other": [...]
}
```

**Featured Game Reasons:**
- `overtime`: Games that went to overtime
- `marquee`: Marquee matchups (e.g., GSW vs LAL)
- `closest`: Best game (closest score for completed games)
- `live`: Currently live games

#### Get Game Details with Boxscore
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
        "teamLogo": "...",
        "starters": [...],
        "bench": [...],
        "topPerformers": {
          "points": [
            {
              "name": "Player Name",
              "stats": {"points": 30},
              "teamName": "Oklahoma City Thunder",
              "teamLogo": "...",
              "teamAbbreviation": "OKC"
            }
          ],
          "rebounds": [...],
          "assists": [...]
        }
      }
    ]
  }
}
```

**Note**: `topPerformers` includes team info (teamName, teamLogo, teamAbbreviation) for each player.

### Players

#### Get Player Details
```
GET /api/nba/players/:playerId
```

#### Get Player Bio
```
GET /api/nba/players/:playerId/bio
```

#### Get Current Season Stats
```
GET /api/nba/players/:playerId/stats/current
```

#### Get Regular Season Stats (All Seasons)
```
GET /api/nba/players/:playerId/stats
```

**Response:**
```json
{
  "playerId": "123456",
  "statistics": [
    {
      "season": "2025-26",
      "stats": {...}
    }
  ]
}
```

**Note**: Seasons are returned from newest to oldest.

#### Get Advanced Stats
```
GET /api/nba/players/:playerId/stats/advanced
```

#### Get Game Log (Last 5 Games)
```
GET /api/nba/players/:playerId/gamelog
```

### Player Statistics

#### Get Top Players by Stat Category
```
GET /api/nba/stats/players?season=2026|2&position=all-positions&limit=100&sort=offensive.avgPoints:desc
```

**Query Parameters:**
- `season`: Season in format "YYYY|type" (e.g., "2026|2" for regular season, "2026|3" for postseason)
- `position`: Position filter (all-positions, guard, forward, center)
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50, max: 100)
- `sort`: Sort field (e.g., "offensive.avgPoints:desc")

**Response:**
```json
{
  "topPlayersByStat": {
    "avgPoints": {
      "players": [
        {
          "id": "123456",
          "name": "Player Name",
          "team": "Team Name",
          "headshot": "...",
          "stats": {
            "avgPoints": {"value": "30.5", "displayValue": "30.5"}
          }
        }
      ]
    },
    "avgRebounds": {...},
    "avgAssists": {...}
  },
  "metadata": {
    "season": "2025-26",
    "totalPlayers": 450
  }
}
```

**Note**: Returns only top 9 players per category, pre-calculated on backend.

### Teams

#### Get Team Details
```
GET /api/nba/teams/:teamAbbreviation
```

**Response:**
```json
{
  "team": {
    "id": "1",
    "name": "Warriors",
    "abbreviation": "GSW",
    "record": {
      "wins": 24,
      "losses": 1
    }
  },
  "players": [
    {
      "id": "123456",
      "name": "Player Name",
      "position": "PG",
      "stats": {...}
    }
  ]
}
```

#### Get Team Leaders
```
GET /api/nba/teams/:teamAbbreviation/leaders
```

**Response:**
```json
{
  "offense": {
    "points": {
      "name": "Player Name",
      "value": "30.5"
    },
    "assists": {...},
    "rebounds": {...}
  },
  "defense": {
    "steals": {...},
    "blocks": {...}
  }
}
```

#### Get Recent Games
```
GET /api/nba/teams/:teamAbbreviation/recent-games?seasontype=2
```

**Query Parameters:**
- `seasontype`: Season type (2 = Regular Season, 3 = Postseason)

**Response:**
```json
{
  "last5Games": [
    {
      "id": "401809835",
      "date": "2025-12-10T00:00:00Z",
      "homeTeam": {...},
      "awayTeam": {...},
      "won": true
    }
  ],
  "next3Games": [...]
}
```

#### Get Team Schedule
```
GET /api/nba/teams/:teamAbbreviation/schedule
```

### Standings

#### Get Team Standings
```
GET /api/nba/standings?season=2026&seasonType=2
```

**Query Parameters:**
- `season`: Season year (default: 2026)
- `seasonType`: Season type (2 = Regular Season, 3 = Postseason)

**Response:**
```json
{
  "seasonDisplayName": "2025-26 Regular Season",
  "standings": {
    "East": [
      {
        "teamName": "Boston Celtics",
        "wins": 24,
        "losses": 1,
        "winPercent": 0.96,
        "winPercentDisplay": ".960",
        "gamesBehind": 0,
        "gamesBehindDisplay": "-"
      }
    ],
    "West": [...]
  }
}
```

**Note**: `winPercentDisplay` and `gamesBehindDisplay` are pre-formatted for display.

### Home Dashboard

#### Get Home Page Data
```
GET /api/nba/home?date=20251210
```

**Query Parameters:**
- `date` (optional): Date in YYYYMMDD format (defaults to today)

**Response:**
```json
{
  "todayTopPerformers": {
    "points": [
      {
        "id": "123456",
        "name": "Player Name",
        "team": "Team Name",
        "teamAbbreviation": "GSW",
        "headshot": "...",
        "points": 45
      }
    ],
    "rebounds": [...],
    "assists": [...]
  },
  "seasonLeaders": {
    "points": [
      {
        "id": "123456",
        "name": "Player Name",
        "team": "Team Name",
        "headshot": "...",
        "value": "34.7",
        "statType": "avgPoints"
      }
    ],
    "rebounds": [...],
    "assists": [...]
  }
}
```

### News

#### Get NBA News
```
GET /api/nba/news
```

**Response:**
```json
{
  "tweets": [
    {
      "id": "1234567890",
      "text": "Tweet content...",
      "author": "Shams Charania",
      "authorHandle": "@ShamsCharania",
      "avatar": "...",
      "timestamp": "2025-12-10T12:00:00Z",
      "images": [...],
      "imageLinks": [...]
    }
  ]
}
```

**Note**: News is cached and refreshed every 5 minutes via cron job.

## Data Models

The API returns data in consistent, well-structured formats. See frontend data models for TypeScript-style JSDoc definitions:
- `gameModels.js` - Game-related types
- `playerModels.js` - Player detail types
- `playerStatsModels.js` - Player stats types
- `standingsModels.js` - Standings types
- `teamModels.js` - Team-related types

## Caching Strategy

- **Games**: 5 seconds cache for live games, 5 minutes for completed games
- **Player Stats**: 5 minutes cache
- **Team Data**: 30 minutes cache
- **Standings**: 30 minutes cache
- **News**: 5 minutes cache (refreshed via cron)

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

## Project Structure

```
nba-stats-api/
├── services/          # Service layer (data fetching & transformation)
│   ├── nbaService.js          # ESPN API integration
│   ├── playerService.js        # Player data transformation
│   ├── teamService.js          # Team data transformation
│   ├── standingsService.js     # Standings transformation
│   ├── espnScraperService.js  # Player stats scraping
│   └── newsService.js          # News/tweets service
├── utils/             # Utility functions
│   └── gameTransformer.js     # Game data transformation
├── server.js          # Express server & routes
└── package.json
```

## License

ISC
