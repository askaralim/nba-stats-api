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
      'STATUS_FINAL_OVERTIME': 3,
      'STATUS_DELAYED': 1,
      'STATUS_POSTPONED': 1,
      'STATUS_SUSPENDED': 2,
      'STATUS_HALFTIME': 2,
      'STATUS_END_PERIOD': 2
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
    
    const awayAbbr = game.awayTeam.abbreviation.toUpperCase();
    const homeAbbr = game.homeTeam.abbreviation.toUpperCase();
    
    // Any game involving GSW is a marquee matchup
    if (awayAbbr === 'GS' || homeAbbr === 'GS') {
      return true;
    }
    
    // Additional manually configured marquee matchups
    const marqueeMatchups = [
      ['BOS', 'LAL'], ['LAL', 'BOS'],
      ['MIA', 'LAL'], ['LAL', 'MIA'],
      ['BOS', 'MIA'], ['MIA', 'BOS'],
      ['PHX', 'LAL'], ['LAL', 'PHX'],
      ['MIL', 'BOS'], ['BOS', 'MIL'],
      ['DEN', 'LAL'], ['LAL', 'DEN']
    ];
    
    const matchup = [awayAbbr, homeAbbr];
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
   * Calculate score difference for games with scores
   * @param {Object} game - Game object
   * @returns {number|null} Score difference or null if scores not available
   */
  getScoreDifference(game) {
    // Works for both live (status 2) and completed (status 3) games
    if (game?.awayTeam?.score === null || game?.homeTeam?.score === null) return null;
    
    return Math.abs(game.awayTeam.score - game.homeTeam.score);
  }

  /**
   * Check if game is closest (score difference <= 5)
   * Works for both live and finished games
   * @param {Object} game - Game object
   * @returns {boolean} True if closest game
   */
  isClosestGame(game) {
    const scoreDiff = this.getScoreDifference(game);
    return scoreDiff !== null && scoreDiff <= 5;
  }

  /**
   * Get game priority for sorting
   * Lower number = higher priority
   * @param {Object} game - Game object
   * @returns {number} Priority value
   */
  getGamePriority(game) {
    const isLive = game.gameStatus === 2;
    const isMarquee = this.isMarqueeMatchup(game);
    const isOT = this.isOvertimeGame(game);
    const isClosest = this.isClosestGame(game);
    const isScheduled = game.gameStatus === 1;
    const isFinished = game.gameStatus === 3;

    // Priority 1: Live marquee games
    if (isLive && isMarquee) return 1;
    
    // Priority 2: Live closest games
    if (isLive && isClosest) return 2;
    
    // Priority 3: Live OT games
    if (isLive && isOT) return 3;
    
    // Priority 4: Live games (other)
    if (isLive) return 4;
    
    // Priority 5: Closest games (even if finished)
    if (isClosest) return 5;
    
    // Priority 6: OT games (even if finished)
    if (isOT) return 6;
    
    // Priority 7: Scheduled games
    if (isScheduled) return 7;
    
    // Priority 8: Regular finished games
    if (isFinished) return 8;
    
    // Default (shouldn't happen)
    return 9;
  }

  /**
   * Sort games by priority
   * @param {Array} games - Array of game objects
   * @returns {Array} Sorted games array
   */
  sortGamesByPriority(games) {
    if (!games || games.length === 0) {
      return [];
    }

    return [...games].sort((a, b) => {
      const priorityA = this.getGamePriority(a);
      const priorityB = this.getGamePriority(b);
      
      // Sort by priority first
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // If same priority and both are closest games, sort by score difference
      const scoreDiffA = this.getScoreDifference(a);
      const scoreDiffB = this.getScoreDifference(b);
      if (scoreDiffA !== null && scoreDiffB !== null) {
        return scoreDiffA - scoreDiffB;
      }
      
      // Maintain original order for same priority
      return 0;
    });
  }

  /**
   * Identify featured games and sort all games by priority
   * @param {Array} games - Array of game objects
   * @returns {Object} { featured: [], other: [], games: [] } - All games sorted by priority
   */
  identifyFeaturedGames(games) {
    if (!games || games.length === 0) {
      return { featured: [], other: [], games: [] };
    }

    // Sort all games by priority
    const sortedGames = this.sortGamesByPriority(games);

    const featured = [];
    const other = [];

    // Categorize games into featured and other
    sortedGames.forEach(game => {
      const isLive = game.gameStatus === 2;
      const isMarquee = this.isMarqueeMatchup(game);
      const isOT = this.isOvertimeGame(game);
      const isClosest = this.isClosestGame(game);

      // Featured games: live marquee, live closest, live OT, closest, OT
      if ((isLive && isMarquee) || 
          (isLive && isClosest) || 
          (isLive && isOT) || 
          isClosest || 
          isOT) {
        // Determine featured reason
        let featuredReason = 'live';
        if (isLive && isMarquee) featuredReason = 'marquee';
        else if (isLive && isClosest) featuredReason = 'closest';
        else if (isLive && isOT) featuredReason = 'overtime';
        else if (isClosest) featuredReason = 'closest';
        else if (isOT) featuredReason = 'overtime';

        featured.push({ ...game, featuredReason });
      } else {
        other.push(game);
      }
    });
    
    return {
      featured: featured.slice(0, 3), // Max 3 featured games
      other: other.slice(0, 4), // Show 4 other games
      games: sortedGames // All games sorted by priority
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

    // Get scores to infer status if needed
    const homeScore = homeCompetitor?.score !== undefined && homeCompetitor?.score !== null 
      ? parseInt(homeCompetitor.score, 10) 
      : null;
    const awayScore = awayCompetitor?.score !== undefined && awayCompetitor?.score !== null 
      ? parseInt(awayCompetitor.score, 10) 
      : null;
    
    // Only consider it has scores if both scores exist AND at least one is > 0
    // 0-0 scores are likely default values for scheduled games, not actual game scores
    const hasActualScores = homeScore !== null && awayScore !== null && (homeScore > 0 || awayScore > 0);
    const isCompleted = statusType.completed === true || status.completed === true;

    // Determine game status - infer from scores if status mapping is unclear
    let gameStatus = this.mapStatus(statusType.name);
    
    // If game has actual scores (not 0-0), it cannot be "Scheduled"
    // Only override status if we have real scores (at least one team has scored)
    if (hasActualScores && gameStatus === 1) {
      // If completed flag is set, it's Final; otherwise it's Live
      gameStatus = isCompleted ? 3 : 2;
    }
    
    // If status is mapped but doesn't match reality, correct it
    if (hasActualScores && !isCompleted && gameStatus === 3) {
      gameStatus = 2; // Has scores but not completed = Live
    }
    if (hasActualScores && isCompleted && gameStatus === 2) {
      gameStatus = 3; // Has scores and completed = Final
    }
    
    // Special case: If scores are 0-0, trust the ESPN status
    // Don't mark 0-0 games as live just because scores exist (they might be default values)
    if (homeScore === 0 && awayScore === 0) {
      // Trust ESPN's status for 0-0 games - don't override
      gameStatus = this.mapStatus(statusType.name);
    }

    const transformedGame = {
      gameId: event.id,
      gameCode: event.shortName || '',
      gameStatusText: statusType.description || statusType.shortDetail || 'Scheduled',
      gameStatus: gameStatus,
      period: status.period || 0,
      gameClock: status.displayClock || '',
      gameTimeGMT: event.date ? this.formatGameTime(event.date) : null,
      gameEt: event.date || null,
      homeTeam: this.transformTeam(homeCompetitor),
      awayTeam: this.transformTeam(awayCompetitor),
      gameLeaders: this.extractGameLeaders(competition.competitors)
    };

    // Calculate competitiveness for finished games
    const competitiveness = this.calculateCompetitiveness(transformedGame);
    if (competitiveness) {
      transformedGame.competitiveness = competitiveness;
    }

    // Calculate max lead from period scores
    const maxLead = this.calculateMaxLead(transformedGame);
    if (maxLead) {
      transformedGame.maxLead = maxLead;
    }

    return transformedGame;
  }

  /**
   * Calculate maximum lead during the game from period-by-period scores
   * @param {Object} game - Game object with teams and periods
   * @returns {Object|null} Max lead data { team: 'home'|'away', points: number, period: number }
   */
  calculateMaxLead(game) {
    const awayPeriods = game.awayTeam?.periods || [];
    const homePeriods = game.homeTeam?.periods || [];

    // Need period data to calculate max lead
    if (awayPeriods.length === 0 || homePeriods.length === 0) {
      return null;
    }

    let maxLead = 0;
    let maxLeadTeam = null;
    let maxLeadPeriod = 0;
    let awayCumulative = 0;
    let homeCumulative = 0;

    // Find the maximum number of periods
    const maxPeriods = Math.max(awayPeriods.length, homePeriods.length);

    // Calculate cumulative scores after each period
    for (let i = 0; i < maxPeriods; i++) {
      const awayPeriod = awayPeriods[i];
      const homePeriod = homePeriods[i];

      if (awayPeriod && homePeriod) {
        awayCumulative += parseInt(awayPeriod.score) || 0;
        homeCumulative += parseInt(homePeriod.score) || 0;

        const lead = Math.abs(awayCumulative - homeCumulative);
        
        if (lead > maxLead) {
          maxLead = lead;
          maxLeadTeam = awayCumulative > homeCumulative ? 'away' : 'home';
          maxLeadPeriod = awayPeriod.period || homePeriod.period || i + 1;
        }
      }
    }

    if (maxLead === 0) {
      return null;
    }

    return {
      team: maxLeadTeam,
      points: maxLead,
      period: maxLeadPeriod,
      teamName: maxLeadTeam === 'home' ? game.homeTeam?.teamName : game.awayTeam?.teamName,
      teamAbbreviation: maxLeadTeam === 'home' ? game.homeTeam?.teamTricode : game.awayTeam?.teamTricode,
      teamLogo: maxLeadTeam === 'home' ? game.homeTeam?.logo : game.awayTeam?.logo
    };
  }

  /**
   * Calculate game competitiveness classification
   * @param {Object} game - Game object with teams and periods
   * @returns {Object} Competitiveness classification { type, label, icon, finalMargin }
   */
  calculateCompetitiveness(game) {
    // Only calculate for finished games
    if (game.gameStatus !== 3) {
      return null;
    }

    const awayScore = game.awayTeam?.score;
    const homeScore = game.homeTeam?.score;

    // Need scores to calculate
    if (awayScore === null || homeScore === null) {
      return null;
    }

    const finalMargin = Math.abs(awayScore - homeScore);
    const isOT = this.isOvertimeGame(game);

    // OT games are always "Classic"
    if (isOT) {
      return {
        type: 'classic',
        label: 'Classic',
        icon: '🔥',
        finalMargin: finalMargin
      };
    }

    // Classify based on final margin
    if (finalMargin <= 3) {
      return {
        type: 'classic',
        label: 'Classic',
        icon: '🔥',
        finalMargin: finalMargin
      };
    } else if (finalMargin <= 7) {
      return {
        type: 'close',
        label: 'Close',
        icon: '⚡',
        finalMargin: finalMargin
      };
    } else if (finalMargin <= 15) {
      return {
        type: 'comfortable',
        label: 'Comfortable',
        icon: null,
        finalMargin: finalMargin
      };
    } else {
      return {
        type: 'blowout',
        label: 'Blowout',
        icon: null,
        finalMargin: finalMargin
      };
    }
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

    // Calculate Game MVP (Who carried?)
    const gameMVP = this.calculateGameMVP(allPlayers, teams);

    return {
      teams: teamsWithTopPerformers,
      gameMVP: gameMVP
    };
  }

  /**
   * Calculate Game Impact Score (GIS) for a player
   * GIS = PTS + 1.2 × REB + 1.5 × AST + 3 × STL + 3 × BLK - 1 × TOV
   * @param {Object} player - Player object with stats
   * @returns {number} Game Impact Score
   */
  calculateGIS(player) {
    if (!player?.stats) return 0;
    
    const pts = parseInt(player.stats.points) || 0;
    const reb = parseInt(player.stats.rebounds) || 0;
    const ast = parseInt(player.stats.assists) || 0;
    const stl = parseInt(player.stats.steals) || 0;
    const blk = parseInt(player.stats.blocks) || 0;
    const tov = parseInt(player.stats.turnovers) || 0;
    
    return pts + (1.2 * reb) + (1.5 * ast) + (3 * stl) + (3 * blk) - (1 * tov);
  }

  /**
   * Calculate Game MVP (Who carried?) - player with highest GIS across both teams
   * @param {Array} allPlayers - Array of all players from both teams
   * @param {Array} teams - Array of team objects with team info
   * @returns {Object|null} Game MVP object with player info and GIS
   */
  calculateGameMVP(allPlayers, teams = []) {
    if (!allPlayers || allPlayers.length === 0) {
      return null;
    }

    // Calculate GIS for all players and find the highest
    let gameMVP = null;
    let highestGIS = -Infinity;

    allPlayers.forEach(player => {
      // Skip players who didn't play
      if (player.didNotPlay) return;
      
      const gis = this.calculateGIS(player);
      
      if (gis > highestGIS) {
        highestGIS = gis;
        
        // Find team info for this player
        const playerTeam = teams.find(t => String(t.teamId) === String(player.teamId));
        
        gameMVP = {
          athleteId: player.athleteId,
          name: player.name,
          shortName: player.shortName,
          jersey: player.jersey,
          position: player.position,
          headshot: player.headshot,
          teamId: player.teamId,
          teamAbbreviation: player.teamAbbreviation,
          teamName: playerTeam?.teamName || '',
          teamLogo: playerTeam?.teamLogo || '',
          gis: Math.round(gis * 10) / 10, // Round to 1 decimal place
          stats: {
            points: player.stats.points || 0,
            rebounds: player.stats.rebounds || 0,
            assists: player.stats.assists || 0,
            steals: player.stats.steals || 0,
            blocks: player.stats.blocks || 0,
            turnovers: player.stats.turnovers || 0
          }
        };
      }
    });

    return gameMVP;
  }
}

module.exports = new GameTransformer();
