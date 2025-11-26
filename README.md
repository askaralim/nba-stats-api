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

