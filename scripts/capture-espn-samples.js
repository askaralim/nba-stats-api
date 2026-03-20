/**
 * Phase 1.2: Capture Live ESPN API Response Samples
 *
 * Fetches all ESPN APIs we use (and potential future ones) and saves
 * raw JSON responses to docs/espn-samples/ for reference and testing.
 *
 * Run: node scripts/capture-espn-samples.js
 * Or:  npm run capture-espn-samples (if script added to package.json)
 */

const fs = require('fs');
const path = require('path');

const SAMPLE_DIR = path.resolve(__dirname, '../../docs/espn-samples');
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Sample IDs (3975 = Stephen Curry, gs = Warriors)
const PLAYER_ID = '3975';
const TEAM = 'gs';
const TEAM_ALT = 'bos';

// Format date as YYYYMMDD for scoreboard
function formatDateForAPI(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

async function fetchJson(url, label) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    console.error(`  ✗ ${label}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

async function main() {
  if (!fs.existsSync(SAMPLE_DIR)) {
    fs.mkdirSync(SAMPLE_DIR, { recursive: true });
    console.log(`Created ${SAMPLE_DIR}\n`);
  }

  const today = new Date();
  const dateStr = formatDateForAPI(today);

  // 1. Fetch scoreboard first to get a real gameId for summary
  const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`;
  console.log('Fetching scoreboard to get gameId...');
  const sb = await fetchJson(scoreboardUrl, 'scoreboard');
  let gameId = '401810743'; // fallback
  if (sb.ok && sb.data?.events?.length > 0) {
    gameId = sb.data.events[0].id;
    console.log(`  Using gameId: ${gameId}\n`);
  }

  const endpoints = [
    // --- Currently used ---
    {
      file: 'scoreboard.json',
      url: scoreboardUrl,
      desc: 'Scoreboard (daily games)'
    },
    {
      file: 'summary.json',
      url: `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?region=us&lang=en&contentorigin=espn&event=${gameId}`,
      desc: 'Game summary (header, boxscore, injuries)'
    },
    {
      file: 'teams.json',
      url: 'https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/teams?region=us&lang=en',
      desc: 'All teams'
    },
    {
      file: 'teams-roster.json',
      url: `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${TEAM}/roster?region=us&lang=en`,
      desc: 'Team roster'
    },
    {
      file: 'teams-single.json',
      url: `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${TEAM}?region=us&lang=en`,
      desc: 'Single team info'
    },
    {
      file: 'teams-athletes-statistics.json',
      url: `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${TEAM}/athletes/statistics?region=us&lang=en&contentorigin=espn`,
      desc: 'Team athletes/statistics (leaders)'
    },
    {
      file: 'teams-schedule.json',
      url: `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${TEAM}/schedule?region=us&lang=en&seasontype=2`,
      desc: 'Team schedule'
    },
    {
      file: 'athletes-info.json',
      url: `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${PLAYER_ID}?region=us&lang=en&contentorigin=espn`,
      desc: 'Player info (base)'
    },
    {
      file: 'athletes-bio.json',
      url: `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${PLAYER_ID}/bio?region=us&lang=en&contentorigin=espn`,
      desc: 'Player bio'
    },
    {
      file: 'athletes-stats.json',
      url: `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${PLAYER_ID}/stats?region=us&lang=en&contentorigin=espn`,
      desc: 'Player stats (regular)'
    },
    {
      file: 'athletes-stats-advanced.json',
      url: `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${PLAYER_ID}/stats?region=us&lang=en&contentorigin=espn&advanced=true`,
      desc: 'Player stats (advanced)'
    },
    {
      file: 'athletes-gamelog.json',
      url: `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${PLAYER_ID}/gamelog?region=us&lang=en&contentorigin=espn`,
      desc: 'Player game log'
    },
    {
      file: 'standings.json',
      url: 'https://site.web.api.espn.com/apis/v2/sports/basketball/nba/standings?region=us&lang=en&contentorigin=espn&type=0&level=2&sort=playoffseed:asc',
      desc: 'Standings'
    },
    {
      file: 'byathlete.json',
      url: 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=true&page=1&limit=50&sort=offensive.avgPoints:desc&season=2026&seasontype=2',
      desc: 'League player stats (byathlete)'
    },
    // --- Future use ---
    {
      file: 'athletes-splits.json',
      url: `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${PLAYER_ID}/splits?region=us&lang=en&contentorigin=espn`,
      desc: 'Player splits (future)'
    },
    {
      file: 'athletes-overview.json',
      url: `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${PLAYER_ID}/overview?region=us&lang=en&contentorigin=espn`,
      desc: 'Player overview (future)'
    },
    {
      file: 'teams-statistics.json',
      url: `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${TEAM}/statistics?region=us&lang=en&contentorigin=espn&sort=avgPoints:asc`,
      desc: 'Team statistics (future)'
    },
    {
      file: 'leaders-team.json',
      url: `https://site.web.api.espn.com/apis/site/v3/sports/basketball/nba/leaders?region=us&lang=en&contentorigin=espn&limit=5&team=${TEAM}&split=34`,
      desc: 'Leaders by team (future)'
    },
    {
      file: 'leaders-league.json',
      url: 'https://site.web.api.espn.com/apis/site/v3/sports/basketball/nba/leaders?region=us&lang=en&contentorigin=espn&limit=5&qualified=true',
      desc: 'League leaders (future)'
    }
  ];

  console.log(`Capturing ${endpoints.length} ESPN API samples...\n`);

  for (const ep of endpoints) {
    process.stdout.write(`  ${ep.file}... `);
    const result = await fetchJson(ep.url, ep.desc);
    if (result.ok) {
      const outPath = path.join(SAMPLE_DIR, ep.file);
      fs.writeFileSync(outPath, JSON.stringify(result.data, null, 2), 'utf8');
      const size = (fs.statSync(outPath).size / 1024).toFixed(1);
      console.log(`✓ (${size} KB)`);
    } else {
      console.log('skipped');
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\nDone. Samples saved to ${SAMPLE_DIR}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
