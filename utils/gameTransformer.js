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
   * Transform scoreboard data to simplified format
   * @param {Object} scoreboardData - Raw ESPN API scoreboard response
   * @returns {Object} Transformed data
   */
  transformScoreboard(scoreboardData) {
    if (!scoreboardData?.events) {
      return {
        date: new Date().toISOString().split('T')[0],
        totalGames: 0,
        games: []
      };
    }

    const date = scoreboardData.day?.date || new Date().toISOString().split('T')[0];

    return {
      date,
      totalGames: scoreboardData.events?.length || 0,
      games: (scoreboardData.events || []).map(event => this.transformGame(event))
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

    return {
      teams: transformedTeams
    };
  }
}

module.exports = new GameTransformer();
