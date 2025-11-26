# NBA Stats Backend API

RESTful API backend for NBA statistics application.

## Features

- Today's games scoreboard
- Game details with period-by-period scores
- Game leaders statistics
- Caching for improved performance

## Tech Stack

- Node.js
- Express.js
- NBA Official API

## Getting Started

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file:

```env
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

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

### Get Today's Games
```
GET /api/nba/games/today?leagueId=00
```

**Response:**
```json
{
  "date": "2025-11-24",
  "totalGames": 5,
  "games": [...]
}
```

### Get Game Details
```
GET /api/nba/games/:gameId
```

**Response:**
```json
{
  "gameId": "0022500283",
  "gameStatusText": "Final",
  "homeTeam": {...},
  "awayTeam": {...},
  ...
}
```

## Deployment

The backend can be deployed to:
- Heroku
- Railway
- Render
- AWS EC2
- DigitalOcean
- Any Node.js hosting platform

Set the `CORS_ORIGIN` environment variable to your frontend URL in production.

