/**
 * Game Data Transformer
 * Transforms ESPN API response to simplified format for frontend
 */

class GameTransformer {
  /**
   * Map ESPN status to internal status code
   * @param {string} espnStatus - ESPN status name
   * @returns {number} Status code (1=Scheduled, 2=Live, 3=Final)
   */
  mapStatus(espnStatus) {
    const statusMap = {
      'STATUS_SCHEDULED': 1,
      'STATUS_IN_PROGRESS': 2,
      'STATUS_FINAL': 3,
      'STATUS_DELAYED': 1,
      'STATUS_POSTPONED': 1,
      'STATUS_SUSPENDED': 2
    };
    return statusMap[espnStatus] || 1;
  }

  /**
   * Parse W-L record string
   * @param {string} summary - Record string like "24-1"
   * @returns {Object} { wins, losses }
   */
  parseRecord(summary) {
    if (!summary) return { wins: 0, losses: 0 };
    const [wins, losses] = summary.split('-').map(Number);
    return { wins: wins || 0, losses: losses || 0 };
  }

  /**
   * Minimize game data for GamesToday page (only what's needed for GameCard)
   * @param {Object} game - Full game object
   * @returns {Object} Minimized game data
   */
  minimizeGameForList(game) {
    if (!game) return null;

    return {
      gameId: game.gameId,
      gameStatus: game.gameStatus,
      gameStatusText: game.gameStatusText,
      gameEt: game.gameEt,
      period: game.period,
      awayTeam: {
        teamName: game.awayTeam?.teamName,
        teamCity: game.awayTeam?.teamCity,
        abbreviation: game.awayTeam?.teamTricode,
        logo: game.awayTeam?.logo,
        wins: game.awayTeam?.wins,
        losses: game.awayTeam?.losses,
        score: game.awayTeam?.score
      },
      homeTeam: {
        teamName: game.homeTeam?.teamName,
        teamCity: game.homeTeam?.teamCity,
        abbreviation: game.homeTeam?.teamTricode,
        logo: game.homeTeam?.logo,
        wins: game.homeTeam?.wins,
        losses: game.homeTeam?.losses,
        score: game.homeTeam?.score
      }
    };
  }

  /**
   * Check if game is a marquee matchup
   * @param {Object} game - Game object
   * @returns {boolean} True if marquee matchup
   */
  isMarqueeMatchup(game) {
    if (!game?.awayTeam?.abbreviation || !game?.homeTeam?.abbreviation) return false;
    
    // Manually configured marquee matchups
    const marqueeMatchups = [
      ['GSW', 'LAL'], ['LAL', 'GSW'],
      ['BOS', 'LAL'], ['LAL', 'BOS'],
      ['MIA', 'LAL'], ['LAL', 'MIA'],
      ['BOS', 'MIA'], ['MIA', 'BOS'],
      ['GSW', 'BOS'], ['BOS', 'GSW'],
      ['PHX', 'LAL'], ['LAL', 'PHX'],
      ['MIL', 'BOS'], ['BOS', 'MIL'],
      ['DEN', 'LAL'], ['LAL', 'DEN']
    ];
    
    const matchup = [game.awayTeam.abbreviation, game.homeTeam.abbreviation];
    return marqueeMatchups.some(m => 
      m[0] === matchup[0] && m[1] === matchup[1]
    );
  }

  /**
   * Check if game went to overtime
   * @param {Object} game - Game object
   * @returns {boolean} True if OT game
   */
  isOvertimeGame(game) {
    // Check if period > 4 (OT games)
    return game?.period > 4 || 
           (game?.gameStatusText && game.gameStatusText.toLowerCase().includes('ot')) ||
           (game?.gameStatusText && game.gameStatusText.toLowerCase().includes('overtime'));
  }

  /**
   * Calculate score difference for completed games
   * @param {Object} game - Game object
   * @returns {number|null} Score difference or null if not completed
   */
  getScoreDifference(game) {
    if (game?.gameStatus !== 3) return null; // Only for completed games
    if (game?.awayTeam?.score === null || game?.homeTeam?.score === null) return null;
    
    return Math.abs(game.awayTeam.score - game.homeTeam.score);
  }

  /**
   * Identify featured games (best game, OT games, marquee matchups)
   * @param {Array} games - Array of game objects
   * @returns {Object} { featured: [], other: [] }
   */
  identifyFeaturedGames(games) {
    if (!games || games.length === 0) {
      return { featured: [], other: [] };
    }

    const featured = [];
    const other = [];
    
    // Find best game (closest score for completed games, or marquee/live games)
    const completedGames = games.filter(g => g.gameStatus === 3);
    const liveGames = games.filter(g => g.gameStatus === 2);
    const scheduledGames = games.filter(g => g.gameStatus === 1);
    
    // Priority 1: OT games (completed)
    const otGames = completedGames.filter(g => this.isOvertimeGame(g));
    otGames.forEach(game => {
      if (!featured.find(f => f.gameId === game.gameId)) {
        featured.push({ ...game, featuredReason: 'overtime' });
      }
    });
    
    // Priority 2: Marquee matchups (any status)
    const marqueeGames = games.filter(g => this.isMarqueeMatchup(g));
    marqueeGames.forEach(game => {
      if (!featured.find(f => f.gameId === game.gameId)) {
        featured.push({ ...game, featuredReason: 'marquee' });
      }
    });
    
    // Priority 3: Best game (closest score, completed games only)
    if (completedGames.length > 0) {
      const gamesWithScores = completedGames
        .map(game => ({
          game,
          scoreDiff: this.getScoreDifference(game)
        }))
        .filter(item => item.scoreDiff !== null)
        .sort((a, b) => a.scoreDiff - b.scoreDiff);
      
      if (gamesWithScores.length > 0) {
        const bestGame = gamesWithScores[0].game;
        if (!featured.find(f => f.gameId === bestGame.gameId) && bestGame.gameStatus === 3) {
          featured.push({ ...bestGame, featuredReason: 'closest' });
        }
      }
    }
    
    // Priority 4: Live games (if not already featured)
    liveGames.forEach(game => {
      if (!featured.find(f => f.gameId === game.gameId)) {
        featured.push({ ...game, featuredReason: 'live' });
      }
    });
    
    // All other games go to "other"
    games.forEach(game => {
      if (!featured.find(f => f.gameId === game.gameId)) {
        other.push(game);
      }
    });
    
    return {
      featured: featured.slice(0, 3), // Max 3 featured games
      other: other.slice(0, 4) // Show 4 other games
    };
  }

  /**
   * Pre-calculate top performers for a team
   * @param {Array} players - Array of player objects
   * @param {number} limit - Number of top performers per category
   * @param {Object} teamInfo - Optional team info to include in performers (teamName, teamLogo, teamAbbreviation)
   * @returns {Object} Top performers by category
   */
  getTopPerformers(players, limit = 3, teamInfo = null) {
    const categories = ['points', 'rebounds', 'assists', 'plusMinus', 'steals', 'blocks'];
    const topPerformers = {};

    categories.forEach(category => {
      topPerformers[category] = [...players]
        .filter(player => {
          const value = player.stats?.[category];
          return value !== null && value !== undefined && value !== '-' && !isNaN(parseFloat(value));
        })
        .sort((a, b) => {
          const aVal = parseFloat(a.stats[category]) || (category === 'plusMinus' ? -Infinity : 0);
          const bVal = parseFloat(b.stats[category]) || (category === 'plusMinus' ? -Infinity : 0);
          return bVal - aVal;
        })
        .slice(0, limit)
        .map(player => ({
          ...player,
          ...(teamInfo && {
            teamName: teamInfo.teamName,
            teamLogo: teamInfo.teamLogo,
            teamAbbreviation: teamInfo.teamAbbreviation
          })
        }));
    });

    return topPerformers;
  }

  /**
   * Transform scoreboard data to simplified format
   * @param {Object} scoreboardData - Raw ESPN API scoreboard response
   * @param {boolean} minimize - If true, return minimized data for GamesToday
   * @returns {Object} Transformed data
   */
  transformScoreboard(scoreboardData, minimize = false) {
    if (!scoreboardData?.events) {
      return {
        date: new Date().toISOString().split('T')[0],
        totalGames: 0,
        games: []
      };
    }

    const date = scoreboardData.day?.date || new Date().toISOString().split('T')[0];
    const games = (scoreboardData.events || []).map(event => this.transformGame(event));

    return {
      date,
      totalGames: games.length,
      games: minimize ? games.map(game => this.minimizeGameForList(game)).filter(Boolean) : games
    };
  }

  /**
   * Transform single game data from ESPN event
   * @param {Object} event - Raw ESPN event data
   * @returns {Object} Transformed game data
   */
  transformGame(event) {
    if (!event?.competitions?.[0]) {
      return null;
    }

    const competition = event.competitions[0];
    const status = event.status || {};
    const statusType = status.type || {};
    
    const homeCompetitor = competition.competitors?.find(c => c.homeAway === 'home');
    const awayCompetitor = competition.competitors?.find(c => c.homeAway === 'away');

    return {
      gameId: event.id,
      gameCode: event.shortName || '',
      gameStatusText: statusType.description || statusType.shortDetail || 'Scheduled',
      gameStatus: this.mapStatus(statusType.name),
      period: status.period || 0,
      gameClock: status.displayClock || '',
      gameTimeGMT: event.date ? this.formatGameTime(event.date) : null,
      gameEt: event.date || null,
      homeTeam: this.transformTeam(homeCompetitor),
      awayTeam: this.transformTeam(awayCompetitor),
      gameLeaders: this.extractGameLeaders(competition.competitors)
    };
  }

  /**
   * Transform team competitor data
   * @param {Object} competitor - ESPN competitor object
   * @returns {Object} Transformed team data
   */
  transformTeam(competitor) {
    if (!competitor?.team) return null;

    const team = competitor.team;
    const overallRecord = competitor.records?.find(r => r.type === 'total') || {};
    const { wins, losses } = this.parseRecord(overallRecord.summary);

    // Extract city and name from displayName (e.g., "Oklahoma City Thunder")
    const displayName = team.displayName || '';
    const parts = displayName.split(' ');
    const city = parts.slice(0, -1).join(' ');
    const name = parts[parts.length - 1] || displayName;

    return {
      teamId: String(team.id),
      teamName: name,
      teamCity: city || team.location || '',
      teamTricode: team.abbreviation || '',
      wins,
      losses,
      score: competitor.score ? parseInt(competitor.score, 10) : null,
      logo: team.logo || `https://a.espncdn.com/i/teamlogos/nba/500/${team.abbreviation?.toLowerCase()}.png`,
      periods: (competitor.linescores || []).map(ls => ({
        period: ls.period,
        score: ls.value,
        periodType: ls.period <= 4 ? 'REGULAR' : 'OVERTIME'
      }))
    };
  }

  /**
   * Extract game leaders from competitors
   * @param {Array} competitors - Array of competitor objects
   * @returns {Object|null} Game leaders data
   */
  extractGameLeaders(competitors) {
    if (!competitors || competitors.length === 0) return null;

    const homeLeaders = this.extractTeamLeaders(competitors.find(c => c.homeAway === 'home'));
    const awayLeaders = this.extractTeamLeaders(competitors.find(c => c.homeAway === 'away'));

    if (!homeLeaders && !awayLeaders) return null;

    return {
      homeLeaders,
      awayLeaders
    };
  }

  /**
   * Extract leaders for a single team
   * @param {Object} competitor - Competitor object
   * @returns {Object|null} Team leaders in format: { name, points, rebounds, assists }
   */
  extractTeamLeaders(competitor) {
    if (!competitor?.leaders) return null;

    const teamLeaders = {
      name: null,
      points: null,
      rebounds: null,
      assists: null
    };

    competitor.leaders.forEach(leaderCategory => {
      const categoryName = leaderCategory.displayName?.toLowerCase();
      const leader = leaderCategory.leaders?.[0];
      
      if (leader?.athlete) {
        const playerName = leader.athlete.displayName || leader.athlete.shortName;
        const value = leader.value;

        // Set the first leader's name (usually points leader)
        if (!teamLeaders.name) {
          teamLeaders.name = playerName;
        }

        // Map category names to expected fields
        if (categoryName === 'points' || categoryName === 'pts') {
          teamLeaders.points = value;
          if (!teamLeaders.name) teamLeaders.name = playerName;
        } else if (categoryName === 'rebounds' || categoryName === 'reb') {
          teamLeaders.rebounds = value;
        } else if (categoryName === 'assists' || categoryName === 'ast') {
          teamLeaders.assists = value;
        }
      }
    });

    // Return null if no leaders found
    return teamLeaders.name ? teamLeaders : null;
  }

  /**
   * Format game time from ISO string
   * @param {string} dateString - ISO 8601 date string
   * @returns {string} Formatted time string
   */
  formatGameTime(dateString) {
    if (!dateString) return null;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleString('en-GB', { timeZone: 'GMT', hour12: false }).replace(',', '') + ' GMT';
  }

  /**
   * Get status display info
   * @param {number} gameStatus - Game status code
   * @param {string} gameStatusText - Game status text
   * @param {number} period - Current period
   * @param {string} gameClock - Game clock
   * @returns {Object} Status information
   */
  getStatusInfo(gameStatus, gameStatusText, period, gameTimeGMT, gameClock) {
    const statusMap = {
      1: { text: 'Scheduled at ' + (gameTimeGMT || ''), color: 'gray', isLive: false },
      2: { text: gameStatusText || 'Live', color: 'red', isLive: true },
      3: { text: 'Final', color: 'green', isLive: false }
    };

    const status = statusMap[gameStatus] || statusMap[1];
    
    return {
      ...status,
      period: period || 0,
      clock: gameClock || ''
    };
  }

  /**
   * Transform boxscore data from ESPN summary API
   * @param {Object} boxscoreData - Raw ESPN boxscore data
   * @returns {Object} Transformed boxscore data
   */
  transformBoxscore(boxscoreData) {
    if (!boxscoreData?.teams || !boxscoreData?.players) {
      return null;
    }

    const teams = boxscoreData.teams.map(teamData => ({
      teamId: teamData.team.id,
      teamName: teamData.team.displayName,
      teamAbbreviation: teamData.team.abbreviation,
      teamLogo: teamData.team.logo,
      homeAway: teamData.homeAway,
      statistics: teamData.statistics || []
    }));

    // Process players - boxscore.players is an array of team entries, each containing athletes
    const allPlayers = [];
    
    boxscoreData.players.forEach(teamPlayerData => {
      const team = teamPlayerData.team;
      const stats = teamPlayerData.statistics?.[0];
      
      if (!stats || !stats.athletes) {
        return;
      }

      const keys = stats.keys || [];
      
      // Process each athlete in this team's statistics
      stats.athletes.forEach(athleteData => {
        const athlete = athleteData.athlete;
        const playerStats = athleteData.stats || [];

        // Map stats array to object using keys
        const statsMap = {};
        keys.forEach((key, index) => {
          if (playerStats[index] !== undefined && playerStats[index] !== null) {
            statsMap[key] = playerStats[index];
          }
        });

        allPlayers.push({
          teamId: team.id,
          teamAbbreviation: team.abbreviation,
          athleteId: athlete?.id,
          name: athlete?.displayName || athlete?.shortName || '',
          shortName: athlete?.shortName || '',
          jersey: athlete?.jersey || '',
          position: athlete?.position?.abbreviation || athlete?.position?.name || '',
          headshot: athlete?.headshot?.href || null,
          starter: athleteData.starter || false,
          didNotPlay: athleteData.didNotPlay || false,
          reason: athleteData.reason || null,
          stats: {
            minutes: statsMap.minutes || '0',
            points: statsMap.points || 0,
            fieldGoals: statsMap['fieldGoalsMade-fieldGoalsAttempted'] || '0-0',
            threePointers: statsMap['threePointFieldGoalsMade-threePointFieldGoalsAttempted'] || '0-0',
            freeThrows: statsMap['freeThrowsMade-freeThrowsAttempted'] || '0-0',
            rebounds: statsMap.rebounds || 0,
            assists: statsMap.assists || 0,
            turnovers: statsMap.turnovers || 0,
            steals: statsMap.steals || 0,
            blocks: statsMap.blocks || 0,
            offensiveRebounds: statsMap.offensiveRebounds || 0,
            defensiveRebounds: statsMap.defensiveRebounds || 0,
            fouls: statsMap.fouls || 0,
            plusMinus: statsMap.plusMinus || 0
          }
        });
      });
    });

    // Separate players by team and by starter/bench
    const transformedTeams = teams.map(team => {
      const teamPlayers = allPlayers.filter(p => String(p.teamId) === String(team.teamId));
      const starters = teamPlayers.filter(p => p.starter && !p.didNotPlay);
      const bench = teamPlayers.filter(p => !p.starter && !p.didNotPlay);
      const didNotPlay = teamPlayers.filter(p => p.didNotPlay);

      return {
        ...team,
        starters,
        bench,
        didNotPlay
      };
    });

    // Pre-calculate top performers for each team (with team info included)
    const teamsWithTopPerformers = transformedTeams.map(team => {
      const allTeamPlayers = [...(team.starters || []), ...(team.bench || [])];
      const teamInfo = {
        teamName: team.teamName,
        teamLogo: team.teamLogo,
        teamAbbreviation: team.teamAbbreviation
      };
      return {
        ...team,
        topPerformers: this.getTopPerformers(allTeamPlayers, 3, teamInfo)
      };
    });

    return {
      teams: teamsWithTopPerformers
    };
  }
}

module.exports = new GameTransformer();
