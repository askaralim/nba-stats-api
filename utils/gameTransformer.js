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

    // Pre-calculate filter flags to avoid frontend duplication
    const isOvertime = this.isOvertimeGame(game);
    const isClosest = this.isClosestGame(game);
    const isMarquee = this.isMarqueeMatchup(game);

    // Use standardized team format
    const awayTeam = game.awayTeam ? this.createStandardTeam(game.awayTeam) : null;
    const homeTeam = game.homeTeam ? this.createStandardTeam(game.homeTeam) : null;

    return {
      gameId: game.gameId,
      gameStatus: game.gameStatus,
      gameStatusText: game.gameStatusText,
      gameEt: game.gameEt,
      period: game.period,
      // Filter flags for frontend filtering
      isOvertime,
      isClosest,
      isMarquee,
      awayTeam: awayTeam ? {
        id: awayTeam.id,
        name: awayTeam.name,
        city: awayTeam.city,
        abbreviation: awayTeam.abbreviation,
        logo: awayTeam.logo,
        wins: awayTeam.wins,
        losses: awayTeam.losses,
        score: awayTeam.score
      } : null,
      homeTeam: homeTeam ? {
        id: homeTeam.id,
        name: homeTeam.name,
        city: homeTeam.city,
        abbreviation: homeTeam.abbreviation,
        logo: homeTeam.logo,
        wins: homeTeam.wins,
        losses: homeTeam.losses,
        score: homeTeam.score
      } : null
    };
  }

  /**
   * Check if game is a marquee matchup
   * @param {Object} game - Game object
   * @returns {boolean} True if marquee matchup
   */
  isMarqueeMatchup(game) {
    // Support both old and new field names during migration
    const awayAbbr = (game?.awayTeam?.abbreviation || game?.awayTeam?.teamTricode || game?.awayTeam?.teamAbbreviation || '').toUpperCase();
    const homeAbbr = (game?.homeTeam?.abbreviation || game?.homeTeam?.teamTricode || game?.homeTeam?.teamAbbreviation || '').toUpperCase();
    
    if (!awayAbbr || !homeAbbr) return false;
    
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
    // Don't calculate for scheduled games
    if (game.gameStatus === 1) return null;
    // Works for both live (status 2) and completed (status 3) games
    if (game?.awayTeam?.score === null || game?.homeTeam?.score === null) return null;
    // Don't consider 0-0 as a valid score difference (scheduled games with default scores)
    if (game.awayTeam.score === 0 && game.homeTeam.score === 0) return null;
    
    return Math.abs(game.awayTeam.score - game.homeTeam.score);
  }

  /**
   * Check if game is closest (score difference <= 5)
   * Only works for live or finished games, not scheduled games
   * @param {Object} game - Game object
   * @returns {boolean} True if closest game
   */
  isClosestGame(game) {
    // Only consider live or finished games, not scheduled games
    if (game.gameStatus === 1) {
      return false;
    }
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
      // Use pre-calculated flags from transformScoreboard if available, otherwise calculate
      const isMarquee = game.isMarquee !== undefined ? game.isMarquee : this.isMarqueeMatchup(game);
      const isOT = game.isOvertime !== undefined ? game.isOvertime : this.isOvertimeGame(game);
      const isClosest = game.isClosest !== undefined ? game.isClosest : this.isClosestGame(game);

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
   * @param {Object} teamInfo - Optional team info to include in performers (name, logo, abbreviation)
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
            teamName: teamInfo.name, // Use standardized 'name'
            teamLogo: teamInfo.logo,
            teamAbbreviation: teamInfo.abbreviation // Use standardized 'abbreviation'
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

    return transformedGame;
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
   * Create standardized team object (unified structure)
   * @param {Object} teamData - Team data from various sources
   * @param {Object} options - Additional options (score, wins, losses, periods)
   * @returns {Object} Standardized team object
   */
  createStandardTeam(teamData, options = {}) {
    if (!teamData) return null;

    // Handle different input formats
    let teamId, name, city, abbreviation, logo;
    
    if (teamData.team) {
      // ESPN competitor format
      const team = teamData.team;
      teamId = String(team.id);
      const displayName = team.displayName || '';
      const parts = displayName.split(' ');
      city = parts.slice(0, -1).join(' ') || team.location || '';
      name = parts[parts.length - 1] || displayName;
      abbreviation = team.abbreviation || '';
      logo = team.logo || `https://a.espncdn.com/i/teamlogos/nba/500/${abbreviation?.toLowerCase()}.png`;
    } else if (teamData.teamId || teamData.id) {
      // Already transformed format
      teamId = String(teamData.teamId || teamData.id);
      name = teamData.teamName || teamData.name || '';
      city = teamData.teamCity || teamData.city || '';
      abbreviation = teamData.teamTricode || teamData.teamAbbreviation || teamData.abbreviation || '';
      logo = teamData.logo || teamData.teamLogo || `https://a.espncdn.com/i/teamlogos/nba/500/${abbreviation?.toLowerCase()}.png`;
    } else {
      return null;
    }

    return {
      id: teamId,
      name: name,
      city: city,
      abbreviation: abbreviation, // ALWAYS use 'abbreviation' (not teamTricode, teamAbbreviation)
      logo: logo,
      wins: options.wins !== undefined ? options.wins : (teamData.wins !== undefined ? teamData.wins : null),
      losses: options.losses !== undefined ? options.losses : (teamData.losses !== undefined ? teamData.losses : null),
      score: options.score !== undefined ? options.score : (teamData.score !== undefined ? teamData.score : null),
      periods: options.periods !== undefined ? options.periods : (teamData.periods || null)
    };
  }

  /**
   * Transform team competitor data (uses standardized format)
   * @param {Object} competitor - ESPN competitor object
   * @returns {Object} Standardized team data
   */
  transformTeam(competitor) {
    if (!competitor?.team) return null;

    const overallRecord = competitor.records?.find(r => r.type === 'total') || {};
    const { wins, losses } = this.parseRecord(overallRecord.summary);

    const periods = (competitor.linescores || []).map(ls => ({
      period: ls.period,
      score: ls.value,
      periodType: ls.period <= 4 ? 'REGULAR' : 'OVERTIME'
    }));

    return this.createStandardTeam(competitor, {
      wins,
      losses,
      score: competitor.score ? parseInt(competitor.score, 10) : null,
      periods: periods.length > 0 ? periods : null
    });
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
  /**
   * Compute structured game facts (deterministic)
   * These facts are computed from game data, NOT generated by AI
   * @param {Object} game - Game object with teams, scores, periods
   * @param {Object} boxscoreData - Raw boxscore data
   * @param {Object} teamStatistics - Team statistics object
   * @returns {Object|null} Structured game facts
   */
  computeGameFacts(game, boxscoreData, teamStatistics) {
    if (!game || !boxscoreData || !teamStatistics) return null;

    const { team1, team2 } = teamStatistics;
    const homeTeam = game.homeTeam;
    const awayTeam = game.awayTeam;

    // Determine which team is which in teamStatistics (support both old and new formats)
    const team1Id = team1.teamId || team1.id;
    const team2Id = team2.teamId || team2.id;
    const homeTeamIdForStats = homeTeam.id || homeTeam.teamId;
    const awayTeamIdForStats = awayTeam.id || awayTeam.teamId;
    const homeStats = String(team1Id) === String(homeTeamIdForStats) ? team1 : team2;
    const awayStats = String(team1Id) === String(awayTeamIdForStats) ? team1 : team2;

    // Parse periods
    // Format: home-away (主队-客队) to match final score format
    const homePeriods = homeTeam.periods || [];
    const awayPeriods = awayTeam.periods || [];
    const q1 = homePeriods[0] ? `${homePeriods[0]?.score || 0}-${awayPeriods[0]?.score || 0}` : '0-0';
    const q2 = homePeriods[1] ? `${homePeriods[1]?.score || 0}-${awayPeriods[1]?.score || 0}` : '0-0';
    const q3 = homePeriods[2] ? `${homePeriods[2]?.score || 0}-${awayPeriods[2]?.score || 0}` : '0-0';
    const q4 = homePeriods[3] ? `${homePeriods[3]?.score || 0}-${awayPeriods[3]?.score || 0}` : '0-0';

    // Check for overtime periods (period > 4)
    const overtimePeriods = [];
    for (let i = 4; i < homePeriods.length; i++) {
      const otNumber = i - 3; // OT1, OT2, etc.
      const otScore = homePeriods[i] ? `${homePeriods[i]?.score || 0}-${awayPeriods[i]?.score || 0}` : '0-0';
      overtimePeriods.push({
        period: otNumber,
        score: otScore
      });
    }
    const hasOvertime = overtimePeriods.length > 0;

    // Calculate halftime scores
    const halftimeAway = (awayPeriods[0]?.score || 0) + (awayPeriods[1]?.score || 0);
    const halftimeHome = (homePeriods[0]?.score || 0) + (homePeriods[1]?.score || 0);

    // Parse field goals and three pointers
    const parseFG = (fg) => {
      const [made, attempted] = fg.split('-').map(Number);
      return { made, attempted };
    };

    const homeFGMade = homeStats.fieldGoals.split('-')[0];
    const homeFGAttempted = homeStats.fieldGoals.split('-')[1];
    const homeFGPercent = homeStats.fieldGoalPercent;
    const awayFGMade = awayStats.fieldGoals.split('-')[0];
    const awayFGAttempted = awayStats.fieldGoals.split('-')[1];
    const awayFGPercent = awayStats.fieldGoalPercent;
    const homeThreePTMade = homeStats.threePointers.split('-')[0];
    const homeThreePTAttempted = homeStats.threePointers.split('-')[1];
    const homeThreePTPercent = homeStats.threePointPercent;
    const awayThreePTMade = awayStats.threePointers.split('-')[0];
    const awayThreePTAttempted = awayStats.threePointers.split('-')[1];
    const awayThreePTPercent = awayStats.threePointPercent;
    const homeFTMade = homeStats.freeThrows.split('-')[0];
    const homeFTAttempted = homeStats.freeThrows.split('-')[1];
    const homeFTPercent = homeStats.freeThrowPercent;
    const awayFTMade = awayStats.freeThrows.split('-')[0];
    const awayFTAttempted = awayStats.freeThrows.split('-')[1];
    const awayFTPercent = awayStats.freeThrowPercent;
    const homeRebounds = homeStats.rebounds;
    const awayRebounds = awayStats.rebounds;
    const homeOffensiveRebounds = homeStats.offensiveRebounds;
    const awayOffensiveRebounds = awayStats.offensiveRebounds;
    const homeDefensiveRebounds = homeStats.defensiveRebounds;
    const awayDefensiveRebounds = awayStats.defensiveRebounds;
    const homeAssists = homeStats.assists;
    const awayAssists = awayStats.assists;

    const homeLargestLead = homeStats.largestLead;
    const awayLargestLead = awayStats.largestLead;
    const homeTurnovers = homeStats.turnovers;
    const awayTurnovers = awayStats.turnovers;
    const homeSteals = homeStats.steals;
    const awaySteals = awayStats.steals;
    const homeBlocks = homeStats.blocks;
    const awayBlocks = awayStats.blocks;
    const homeFouls = homeStats.fouls;
    const awayFouls = awayStats.fouls;
    const homeTurnoverPoints = homeStats.turnoverPoints;
    const awayTurnoverPoints = awayStats.turnoverPoints;
    const homeFastBreakPoints = homeStats.fastBreakPoints;
    const awayFastBreakPoints = awayStats.fastBreakPoints;
    const homePointsInPaint = homeStats.pointsInPaint;
    const awayPointsInPaint = awayStats.pointsInPaint;
    const homeLeadChanges = homeStats.leadChanges;
    const awayLeadChanges = awayStats.leadChanges;
    const homeLeadPercentage = homeStats.leadPercentage;
    const awayLeadPercentage = awayStats.leadPercentage;
    const homeTechnicalFouls = homeStats.totalTechnicalFouls;
    const awayTechnicalFouls = awayStats.totalTechnicalFouls;

    // Determine halftime leader
    let halftimeLeader = 'tie';
    if (halftimeAway > halftimeHome) {
      halftimeLeader = 'away';
    } else if (halftimeHome > halftimeAway) {
      halftimeLeader = 'home';
    }

    // Determine winner
    const winner = homeTeam.score > awayTeam.score ? 'home' : 
                   awayTeam.score > homeTeam.score ? 'away' : 'tie';

    // Find top scorer from boxscore
    const allPlayers = [];
    if (boxscoreData.players) {
      boxscoreData.players.forEach(teamPlayerData => {
        const stats = teamPlayerData.statistics?.[0];
        if (stats && stats.athletes) {
          stats.athletes.forEach(athleteData => {
            const athlete = athleteData.athlete;
            const playerStats = athleteData.stats || [];
            const keys = stats.keys || [];
            const statsMap = {};
            keys.forEach((key, index) => {
              if (playerStats[index] !== undefined) {
                statsMap[key] = playerStats[index];
              }
            });
            allPlayers.push({
              name: athlete?.displayName || athlete?.shortName || '',
              points: parseInt(statsMap.points || 0),
              teamId: teamPlayerData.team?.id
            });
          });
        }
      });
    }

    const homeTeamIdForScorer = homeTeam.id || homeTeam.teamId;
    const awayTeamIdForScorer = awayTeam.id || awayTeam.teamId;
    const topScorerHome = allPlayers.reduce((max, player) => 
      String(player.teamId) === String(homeTeamIdForScorer) && player.points > (max?.points || 0) ? player : max, null
    );
    const topScorerAway = allPlayers.reduce((max, player) => 
      String(player.teamId) === String(awayTeamIdForScorer) && player.points > (max?.points || 0) ? player : max, null
    );

      return {
        home_team: homeTeam.name || homeTeam.teamName, // Support both formats
        away_team: awayTeam.name || awayTeam.teamName, // Support both formats
      home_score: homeTeam.score || 0,
      away_score: awayTeam.score || 0,
      winner: winner,
      home_half: halftimeHome,
      away_half: halftimeAway,
      q1,
      q2,
      q3,
      q4,
      fg_home_made: homeFGMade || 0,
      fg_home_attempted: homeFGAttempted || 0,
      fg_home_percent: homeFGPercent || 0,
      fg_away_made: awayFGMade || 0,
      fg_away_attempted: awayFGAttempted || 0,
      fg_away_percent: awayFGPercent || 0,
      three_home_made: homeThreePTMade || 0,
      three_home_attempted: homeThreePTAttempted || 0,
      three_home_percent: homeThreePTPercent || 0,
      three_away_made: awayThreePTMade || 0,
      three_away_attempted: awayThreePTAttempted || 0,
      three_away_percent: awayThreePTPercent || 0,
      ft_home_made: homeFTMade || 0,
      ft_home_attempted: homeFTAttempted || 0,
      ft_home_percent: homeFTPercent || 0,
      ft_away_made: awayFTMade || 0,
      ft_away_attempted: awayFTAttempted || 0,
      ft_away_percent: awayFTPercent || 0,
      to_home: homeTurnovers || 0,
      to_away: awayTurnovers || 0,
      reb_home: homeRebounds || 0,
      reb_home_offensive: homeOffensiveRebounds || 0,
      reb_home_defensive: homeDefensiveRebounds || 0,
      reb_away: awayRebounds || 0,
      reb_away_offensive: awayOffensiveRebounds || 0,
      reb_away_defensive: awayDefensiveRebounds || 0,
      has_overtime: hasOvertime,
      overtime_periods: overtimePeriods,
      // Additional facts for potential future use
      halftime_leader: halftimeLeader,
      largest_lead_home: homeLargestLead,
      largest_lead_away: awayLargestLead,
      foul_home: homeFouls || 0,
      foul_away: awayFouls || 0,
      points_in_paint_home: homePointsInPaint || 0,
      points_in_paint_away: awayPointsInPaint || 0,
      fast_break_points_home: homeFastBreakPoints || 0,
      fast_break_points_away: awayFastBreakPoints || 0,
      turnover_points_home: homeTurnoverPoints || 0,
      turnover_points_away: awayTurnoverPoints || 0,
      top_scorer_home: topScorerHome?.name || '',
      top_scorer_away: topScorerAway?.name || '',
      top_points_home: topScorerHome?.points || 0,
      top_points_away: topScorerAway?.points || 0
    };
  }

  transformBoxscore(boxscoreData) {
    if (!boxscoreData?.teams) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[transformBoxscore] Missing boxscoreData.teams');
      }
      return null;
    }

    // Transform teams using standardized format
    const teams = boxscoreData.teams.map(teamData => {
      const standardTeam = this.createStandardTeam({
        team: teamData.team
      });
      return {
        ...standardTeam,
        homeAway: teamData.homeAway,
        statistics: teamData.statistics || []
      };
    });

    // Process players - boxscore.players is an array of team entries, each containing athletes
    const allPlayers = [];
    
    // Check if players data exists
    if (!boxscoreData.players || !Array.isArray(boxscoreData.players)) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[transformBoxscore] Missing or invalid boxscoreData.players:', {
          hasPlayers: !!boxscoreData.players,
          isArray: Array.isArray(boxscoreData.players),
          keys: boxscoreData ? Object.keys(boxscoreData) : []
        });
      }
      // Return teams with empty arrays if no players data
      return {
        teams: teams.map(team => ({
          ...team,
          starters: [],
          bench: [],
          didNotPlay: [],
          topPerformers: {
            points: [],
            rebounds: [],
            assists: [],
            plusMinus: [],
            steals: [],
            blocks: []
          }
        })),
        gameMVP: null
      };
    }
    
    boxscoreData.players.forEach(teamPlayerData => {
      const team = teamPlayerData.team;
      if (!team) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[transformBoxscore] Missing team in teamPlayerData');
        }
        return;
      }
      
      const stats = teamPlayerData.statistics?.[0];
      
      if (!stats || !stats.athletes) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[transformBoxscore] Missing stats or athletes for team:', team.id, {
            hasStats: !!stats,
            hasAthletes: !!stats?.athletes,
            statisticsLength: teamPlayerData.statistics?.length
          });
        }
        return;
      }

      const keys = stats.keys || [];
      
      // Process each athlete in this team's statistics
      stats.athletes.forEach(athleteData => {
        const athlete = athleteData.athlete;
        if (!athlete) {
          return;
        }
        
        const playerStats = athleteData.stats || [];

        // Map stats array to object using keys
        const statsMap = {};
        keys.forEach((key, index) => {
          if (playerStats[index] !== undefined && playerStats[index] !== null) {
            statsMap[key] = playerStats[index];
          }
        });

        allPlayers.push({
          teamId: String(team.id), // Keep teamId for filtering, but use standardized team reference
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
      // Match players to team using teamId (from player) vs id (from transformed team)
      const teamPlayers = allPlayers.filter(p => String(p.teamId) === String(team.id));
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
      // Use standardized team format for teamInfo
      const teamInfo = {
        name: team.name,
        logo: team.logo,
        abbreviation: team.abbreviation
      };
      return {
        ...team,
        topPerformers: this.getTopPerformers(allTeamPlayers, 1, teamInfo)
      };
    });

    // Calculate Game MVP (Who carried?) - only from winning team
    // Get team scores from boxscore data
    const teamScores = {};
    teams.forEach(team => {
      // Try to get score from boxscore team data first
      const boxscoreTeam = boxscoreData.teams?.find(t => String(t.team?.id) === String(team.teamId));
      let teamScore = null;
      
      if (boxscoreTeam?.score !== undefined && boxscoreTeam?.score !== null) {
        // Score is directly available
        teamScore = parseInt(boxscoreTeam.score, 10);
      } else {
        // Calculate total team score from player points
        const teamPlayers = allPlayers.filter(p => String(p.teamId) === String(team.id));
        teamScore = teamPlayers.reduce((sum, player) => {
          return sum + (parseInt(player.stats.points) || 0);
        }, 0);
      }
      
      teamScores[team.teamId] = teamScore;
    });
    
    // Determine winning team (team with higher score)
    const teamIds = Object.keys(teamScores);
    let winningTeamId = null;
    if (teamIds.length === 2) {
      const score1 = teamScores[teamIds[0]];
      const score2 = teamScores[teamIds[1]];
      if (score1 > score2) {
        winningTeamId = teamIds[0];
      } else if (score2 > score1) {
        winningTeamId = teamIds[1];
      }
      // If scores are equal (tie), winningTeamId remains null - MVP from both teams
    }
    
    const gameMVP = this.calculateGameMVP(allPlayers, teams, winningTeamId);

    // Generate game story (only for completed games)
    const gameStory = this.generateGameStory(boxscoreData, teamsWithTopPerformers, gameMVP, winningTeamId);

    // Extract team statistics for Team Stats section
    const teamStatistics = this.extractTeamStatistics(boxscoreData, teamsWithTopPerformers);

    return {
      teams: teamsWithTopPerformers,
      gameMVP: gameMVP,
      gameStory: gameStory,
      teamStatistics: teamStatistics
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
  /**
   * Calculate Game MVP (Who carried?) - only from winning team
   * @param {Array} allPlayers - All players from both teams
   * @param {Array} teams - Teams array with team info
   * @param {string|null} winningTeamId - ID of the winning team (null if tie or not determined)
   * @returns {Object|null} Game MVP player object
   */
  calculateGameMVP(allPlayers, teams = [], winningTeamId = null) {
    if (!allPlayers || allPlayers.length === 0) {
      return null;
    }

    // Filter to only players from winning team if winning team is determined
    let eligiblePlayers = allPlayers;
    if (winningTeamId) {
      eligiblePlayers = allPlayers.filter(player => String(player.teamId) === String(winningTeamId));
      
      // If no players from winning team, fall back to all players
      if (eligiblePlayers.length === 0) {
        eligiblePlayers = allPlayers;
      }
    }

    // Calculate GIS for eligible players and find the highest
    let gameMVP = null;
    let highestGIS = -Infinity;

    eligiblePlayers.forEach(player => {
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
          teamAbbreviation: playerTeam?.abbreviation || '', // Use standardized 'abbreviation'
          teamName: playerTeam?.name || '', // Use standardized 'name'
          teamLogo: playerTeam?.logo || '',
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

  /**
   * Extract team statistics from boxscore data (from team statistics array)
   * @param {Object} boxscoreData - Raw boxscore data
   * @param {Array} teams - Transformed teams with players
   * @returns {Object|null} Team statistics for both teams
   */
  extractTeamStatistics(boxscoreData, teams) {
    if (!boxscoreData?.teams) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[extractTeamStatistics] Missing boxscoreData.teams');
      }
      return null;
    }
    
    if (!teams || teams.length < 2) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[extractTeamStatistics] Invalid teams array:', {
          hasTeams: !!teams,
          teamsLength: teams?.length,
          teamsType: typeof teams
        });
      }
      return null;
    }

    const extractTeamStats = (boxscoreTeam, transformedTeam) => {
      // Try to get stats from boxscore team statistics first
      // Structure: boxscoreTeam.statistics is an array of stat objects
      // Each object has: { name, displayValue, label, abbreviation }
      const statisticsArray = boxscoreTeam.statistics || [];

      let stats = {};

      if (statisticsArray.length > 0) {
        // Parse statistics array into a key-value map
        statisticsArray.forEach(stat => {
          if (!stat.name || stat.displayValue === undefined) return;

          const statName = stat.name;
          const displayValue = stat.displayValue;

          // Handle compound stats like "fieldGoalsMade-fieldGoalsAttempted"
          if (statName.includes('-')) {
            // Split compound stat names (e.g., "fieldGoalsMade-fieldGoalsAttempted")
            const parts = statName.split('-');
            const values = displayValue.split('-').map(v => parseInt(v.trim()) || 0);
            
            parts.forEach((part, index) => {
              if (values[index] !== undefined) {
                stats[part] = values[index];
              }
            });
          } else {
            // Single stat - parse displayValue to number
            // Handle percentage stats (remove % if present, but displayValue is already numeric)
            let numericValue = displayValue;
            if (typeof displayValue === 'string') {
              // Remove any non-numeric characters except decimal point
              numericValue = parseFloat(displayValue.replace(/[^0-9.]/g, '')) || 0;
            } else {
              numericValue = parseFloat(displayValue) || 0;
            }
            
            stats[statName] = numericValue;
          }
        });
      }

      // Fallback: Calculate from player stats if team stats not available
      const allPlayers = [...(transformedTeam.starters || []), ...(transformedTeam.bench || [])];
      
      // Extract stats from parsed statistics array
      // Handle both compound names and individual stat names
      let fgMade = stats.fieldGoalsMade || 0;
      let fgAttempted = stats.fieldGoalsAttempted || 0;
      let threePTMade = stats.threePointFieldGoalsMade || 0;
      let threePTAttempted = stats.threePointFieldGoalsAttempted || 0;
      let ftMade = stats.freeThrowsMade || 0;
      let ftAttempted = stats.freeThrowsAttempted || 0;
      let totalRebounds = stats.totalRebounds || stats.rebounds || 0;
      let offensiveRebounds = stats.offensiveRebounds || 0;
      let defensiveRebounds = stats.defensiveRebounds || 0;
      let assists = stats.assists || 0;
      let steals = stats.steals || 0;
      let blocks = stats.blocks || 0;
      let turnovers = stats.totalTurnovers || 0;
      let fouls = stats.fouls || 0;
      let points = stats.points || 0;
      let turnoverPoints = stats.turnoverPoints || 0;
      let fastBreakPoints = stats.fastBreakPoints || 0;
      let pointsInPaint = stats.pointsInPaint || 0;
      let largestLead = stats.largestLead || 0;
      let leadChanges = stats.leadChanges || 0;
      let leadPercentage = stats.leadPercentage || 0;
      let technicalFouls = stats.totalTechnicalFouls || 0;
      
      // Get percentages from parsed stats if available
      // Check if percentages were parsed (use undefined to distinguish from 0%)
      let fgPercent = stats.fieldGoalPct !== undefined ? stats.fieldGoalPct : undefined;
      let threePTPercent = stats.threePointFieldGoalPct !== undefined ? stats.threePointFieldGoalPct : undefined;
      let ftPercent = stats.freeThrowPct !== undefined ? stats.freeThrowPct : undefined;


      // If stats not in team data, calculate from players
      if (points === 0) {
        allPlayers.forEach(player => {
          points += parseInt(player.stats?.points || 0);
        });
      }

      // Use standardized team format
      return {
        teamId: transformedTeam.id || transformedTeam.teamId, // Support both during migration
        teamName: transformedTeam.name || transformedTeam.teamName, // Use standardized 'name'
        teamAbbreviation: transformedTeam.abbreviation || transformedTeam.teamAbbreviation, // Use standardized 'abbreviation'
        teamLogo: transformedTeam.logo || transformedTeam.teamLogo,
        fieldGoals: `${fgMade}-${fgAttempted}`,
        fieldGoalPercent: fgPercent,
        threePointers: `${threePTMade}-${threePTAttempted}`,
        threePointPercent: threePTPercent,
        freeThrows: `${ftMade}-${ftAttempted}`,
        freeThrowPercent: ftPercent,
        rebounds: totalRebounds,
        offensiveRebounds: offensiveRebounds,
        defensiveRebounds: defensiveRebounds,
        assists: assists,
        steals: steals,
        blocks: blocks,
        turnovers: turnovers,
        fouls: fouls,
        points: points,
        turnoverPoints: turnoverPoints,
        fastBreakPoints: fastBreakPoints,
        pointsInPaint: pointsInPaint,
        largestLead: largestLead,
        leadChanges: leadChanges,
        leadPercentage: leadPercentage,
        technicalFouls: technicalFouls
      };
    };

    // Match teams using id (standardized) or teamId (legacy)
    const team1Id = teams[0].id || teams[0].teamId;
    const team2Id = teams[1].id || teams[1].teamId;
    
    const boxscoreTeam1 = boxscoreData.teams.find(t => String(t.team?.id) === String(team1Id));
    const boxscoreTeam2 = boxscoreData.teams.find(t => String(t.team?.id) === String(team2Id));

    if (!boxscoreTeam1 || !boxscoreTeam2) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[extractTeamStatistics] Failed to match teams:', {
          team1Id,
          team2Id,
          foundTeam1: !!boxscoreTeam1,
          foundTeam2: !!boxscoreTeam2,
          boxscoreTeamIds: boxscoreData.teams.map(t => t.team?.id),
          transformedTeamIds: teams.map(t => t.id || t.teamId)
        });
      }
      return null;
    }

    return {
      team1: extractTeamStats(boxscoreTeam1, teams[0]),
      team2: extractTeamStats(boxscoreTeam2, teams[1])
    };
  }

  /**
   * Transform season series data from ESPN summary API
   * @param {Object} summaryData - Raw ESPN summary API response
   * @param {Object} currentGame - Current game object with team info
   * @returns {Object|null} Season series data
   */
  /**
   * Transform season series data from ESPN summary API
   * ESPN API structure: seasonseries is an array, each item has:
   * - type, title, summary, seriesScore (string like "1-1"), totalCompetitions
   * - events: array of games with competitors (homeAway, winner, team, score)
   * @param {Object} summaryData - Raw ESPN summary data
   * @param {Object} currentGame - Current game object with team IDs
   * @returns {Object|null} Transformed season series data
   */
  transformSeasonSeries(summaryData, currentGame) {
    // seasonseries is an array - get the first item (usually regular season series)
    const seasonseriesArray = summaryData?.seasonseries;
    if (!seasonseriesArray || !Array.isArray(seasonseriesArray) || seasonseriesArray.length === 0) {
      return null;
    }

    // Get the first series (usually "Regular Season Series")
    const series = seasonseriesArray[0];
    if (!series) {
      return null;
    }

    // Support both old and new team ID formats during migration
    const awayTeamId = String(currentGame?.awayTeam?.id || currentGame?.awayTeam?.teamId);
    const homeTeamId = String(currentGame?.homeTeam?.id || currentGame?.homeTeam?.teamId);

    // Extract series score from seriesScore string (e.g., "1-1")
    // Note: We'll calculate the actual score from game results for accuracy
    const seriesScore = {
      awayWins: 0,
      homeWins: 0
    };

    // Extract games from events array
    const games = [];
    
    if (series.events && Array.isArray(series.events)) {
      series.events.forEach(event => {
        // Events have competitors directly (not nested in competitions)
        const awayCompetitor = event.competitors?.find(c => c.homeAway === 'away');
        const homeCompetitor = event.competitors?.find(c => c.homeAway === 'home');
        
        if (!awayCompetitor || !homeCompetitor) return;

        const gameAwayTeamId = String(awayCompetitor.team?.id);
        const gameHomeTeamId = String(homeCompetitor.team?.id);
        
        // Check if this game involves the same teams
        const isRelevantGame = 
          (gameAwayTeamId === awayTeamId && gameHomeTeamId === homeTeamId) ||
          (gameAwayTeamId === homeTeamId && gameHomeTeamId === awayTeamId);

        if (!isRelevantGame) return;

        // Status is in statusType (not status.type)
        const statusType = event.statusType;
        const isCompleted = statusType?.completed === true || statusType?.name === 'STATUS_FINAL';
        const awayScore = awayCompetitor.score ? parseInt(awayCompetitor.score, 10) : null;
        const homeScore = homeCompetitor.score ? parseInt(homeCompetitor.score, 10) : null;
        
        // Determine which team won relative to current game teams
        let winner = null;
        if (isCompleted && awayScore !== null && homeScore !== null) {
          // Check if the winner in the event matches current away or home team
          const eventWinner = awayCompetitor.winner ? awayCompetitor : (homeCompetitor.winner ? homeCompetitor : null);
          if (eventWinner) {
            const winnerTeamId = String(eventWinner.team?.id);
            if (winnerTeamId === awayTeamId) {
              winner = 'away';
            } else if (winnerTeamId === homeTeamId) {
              winner = 'home';
            }
          }
        }

        games.push({
          gameId: event.id,
          date: event.date,
          isCompleted: isCompleted,
          awayTeam: {
            id: gameAwayTeamId,
            abbreviation: awayCompetitor.team?.abbreviation,
            score: awayScore
          },
          homeTeam: {
            id: gameHomeTeamId,
            abbreviation: homeCompetitor.team?.abbreviation,
            score: homeScore
          },
          winner: winner,
          // Flag to indicate if this is the current game
          isCurrentGame: event.id === currentGame?.gameId
        });
      });
    }

    // Recalculate series score from completed games if seriesScore wasn't reliable
    // This ensures accuracy based on actual game results
    if (games.length > 0) {
      let calculatedAwayWins = 0;
      let calculatedHomeWins = 0;
      
      games.forEach(game => {
        if (game.isCompleted && game.winner) {
          if (game.winner === 'away') {
            calculatedAwayWins++;
          } else if (game.winner === 'home') {
            calculatedHomeWins++;
          }
        }
      });

      // Use calculated scores if we have completed games
      if (calculatedAwayWins > 0 || calculatedHomeWins > 0) {
        seriesScore.awayWins = calculatedAwayWins;
        seriesScore.homeWins = calculatedHomeWins;
      }
    }

    return {
      score: seriesScore,
      games: games.sort((a, b) => {
        // Sort by date, current game first
        if (a.isCurrentGame) return -1;
        if (b.isCurrentGame) return 1;
        return new Date(a.date) - new Date(b.date);
      }),
      totalGames: series.totalCompetitions || games.length
    };
  }

  /**
   * Calculate team statistics from boxscore data
   * @param {Array} teams - Teams array with players
   * @returns {Object|null} Team statistics comparison
   */
  calculateTeamStatistics(teams) {
    if (!teams || teams.length < 2) return null;

    const [team1, team2] = teams;
    
    const calculateTeamStats = (team) => {
      const allPlayers = [...(team.starters || []), ...(team.bench || [])];
      
      let fgMade = 0, fgAttempted = 0;
      let threePTMade = 0, threePTAttempted = 0;
      let ftMade = 0, ftAttempted = 0;
      let totalRebounds = 0;
      let totalTurnovers = 0;
      let totalPoints = 0;

      allPlayers.forEach(player => {
        // Parse field goals (format: "made-attempted")
        const fg = player.stats?.fieldGoals || '0-0';
        const [fgM, fgA] = fg.split('-').map(Number);
        fgMade += fgM || 0;
        fgAttempted += fgA || 0;

        // Parse three pointers
        const threePT = player.stats?.threePointers || '0-0';
        const [threePTM, threePTA] = threePT.split('-').map(Number);
        threePTMade += threePTM || 0;
        threePTAttempted += threePTA || 0;

        // Parse free throws
        const ft = player.stats?.freeThrows || '0-0';
        const [ftM, ftA] = ft.split('-').map(Number);
        ftMade += ftM || 0;
        ftAttempted += ftA || 0;

        totalRebounds += parseInt(player.stats?.rebounds || 0);
        totalTurnovers += parseInt(player.stats?.turnovers || 0);
        totalPoints += parseInt(player.stats?.points || 0);
      });

      const fgPercent = fgAttempted > 0 ? (fgMade / fgAttempted) * 100 : 0;
      const threePTPercent = threePTAttempted > 0 ? (threePTMade / threePTAttempted) * 100 : 0;
      const ftPercent = ftAttempted > 0 ? (ftMade / ftAttempted) * 100 : 0;

      return {
        teamId: team.id || team.teamId, // Support both formats
        teamName: team.name || team.teamName, // Support both formats
        teamAbbreviation: team.abbreviation || team.teamAbbreviation, // Support both formats
        fgMade,
        fgAttempted,
        fgPercent: Math.round(fgPercent * 10) / 10,
        threePTMade,
        threePTAttempted,
        threePTPercent: Math.round(threePTPercent * 10) / 10,
        ftMade,
        ftAttempted,
        ftPercent: Math.round(ftPercent * 10) / 10,
        rebounds: totalRebounds,
        turnovers: totalTurnovers,
        points: totalPoints
      };
    };

    const team1Stats = calculateTeamStats(team1);
    const team2Stats = calculateTeamStats(team2);

    return {
      team1: team1Stats,
      team2: team2Stats,
      differences: {
        fgPercent: Math.abs(team1Stats.fgPercent - team2Stats.fgPercent),
        threePTMade: Math.abs(team1Stats.threePTMade - team2Stats.threePTMade),
        turnovers: Math.abs(team1Stats.turnovers - team2Stats.turnovers),
        rebounds: Math.abs(team1Stats.rebounds - team2Stats.rebounds)
      }
    };
  }

  /**
   * Generate game story in Chinese
   * @param {Object} boxscoreData - Raw boxscore data
   * @param {Array} teams - Transformed teams with players
   * @param {Object} gameMVP - Game MVP object
   * @param {string|null} winningTeamId - Winning team ID
   * @returns {Object|null} Game story with summary and insights
   */
  generateGameStory(boxscoreData, teams, gameMVP, winningTeamId) {
    if (!boxscoreData || !teams || teams.length < 2) return null;

    // Only generate story for completed games (must have winning team)
    if (!winningTeamId) return null;

    // Calculate team statistics
    const teamStats = this.calculateTeamStatistics(teams);
    if (!teamStats) return null;

    const { team1, team2, differences } = teamStats;
    
    // Determine winning and losing teams
    const winningTeam = winningTeamId === team1.teamId ? team1 : 
                       winningTeamId === team2.teamId ? team2 : null;
    const losingTeam = winningTeam === team1 ? team2 : team1;

    if (!winningTeam || !losingTeam) return null;
    
    // Ensure both teams have valid scores
    if (winningTeam.points === 0 && losingTeam.points === 0) return null;

    const margin = Math.abs(winningTeam.points - losingTeam.points);

    // Generate main summary in Chinese
    let summary = '';
    const winningTeamName = winningTeam.teamName;
    
    if (margin <= 3) {
      summary = `${winningTeamName}以${margin}分优势险胜对手。`;
    } else if (margin <= 7) {
      summary = `${winningTeamName}以${margin}分优势获胜。`;
    } else if (margin <= 15) {
      summary = `${winningTeamName}以${margin}分优势取得胜利。`;
    } else {
      summary = `${winningTeamName}以${margin}分的巨大优势取得胜利。`;
    }

    // Generate insights (2-3 key points) in Chinese
    const insights = [];

    // Insight 1: FG% difference (if significant >5%)
    if (differences.fgPercent > 5) {
      const winnerFG = winningTeam.fgPercent;
      const loserFG = losingTeam.fgPercent;
      if (winnerFG > loserFG) {
        insights.push(`投篮命中率更优（${winnerFG}% vs ${loserFG}%）`);
      } else {
        insights.push(`投篮命中率更优（${loserFG}% vs ${winnerFG}%）`);
      }
    }

    // Insight 2: 3PT made difference (if significant >3)
    if (differences.threePTMade > 3) {
      const winner3PT = winningTeam.threePTMade;
      const loser3PT = losingTeam.threePTMade;
      if (winner3PT > loser3PT) {
        insights.push(`三分球表现更出色（${winner3PT}个 vs ${loser3PT}个）`);
      } else {
        insights.push(`三分球表现更出色（${loser3PT}个 vs ${winner3PT}个）`);
      }
    }

    // Insight 3: Turnovers (if difference >5)
    if (differences.turnovers > 5) {
      const winnerTOV = winningTeam.turnovers;
      const loserTOV = losingTeam.turnovers;
      if (winnerTOV < loserTOV) {
        insights.push(`失误控制更好（${winnerTOV}次 vs ${loserTOV}次）`);
      } else {
        insights.push(`失误控制更好（${loserTOV}次 vs ${winnerTOV}次）`);
      }
    }

    // Insight 4: Rebounds (if difference >10)
    if (differences.rebounds > 10) {
      const winnerREB = winningTeam.rebounds;
      const loserREB = losingTeam.rebounds;
      if (winnerREB > loserREB) {
        insights.push(`篮板球优势明显（${winnerREB}个 vs ${loserREB}个）`);
      } else {
        insights.push(`篮板球优势明显（${loserREB}个 vs ${winnerREB}个）`);
      }
    }

    // Insight 5: Game MVP mention (if MVP has exceptional stats)
    if (gameMVP && gameMVP.gis > 30) {
      const mvpStats = gameMVP.stats;
      const statHighlights = [];
      if (mvpStats.points >= 30) statHighlights.push(`${mvpStats.points}分`);
      if (mvpStats.rebounds >= 10) statHighlights.push(`${mvpStats.rebounds}个篮板`);
      if (mvpStats.assists >= 10) statHighlights.push(`${mvpStats.assists}次助攻`);
      
      if (statHighlights.length > 0) {
        insights.push(`${gameMVP.name}发挥出色，贡献${statHighlights.join('、')}`);
      }
    }

    // Limit to 2-3 insights, prioritize most significant
    const sortedInsights = insights.slice(0, 3);

    // If no insights generated, add a generic one
    if (sortedInsights.length === 0) {
      sortedInsights.push('双方表现接近，细节决定胜负');
    }

    return {
      summary,
      insights: sortedInsights
    };
  }

  /**
   * Transform injuries data from ESPN summary API
   * @param {Object} summaryData - Raw ESPN summary API response
   * @param {Object} currentGame - Current game object with team info
   * @returns {Object|null} Injuries data grouped by team
   */
  transformInjuries(summaryData, currentGame) {
    // ESPN API structure: injuries is an array of team objects, each with team info and injuries array
    const injuriesArray = summaryData?.injuries;
    
    if (!injuriesArray || !Array.isArray(injuriesArray)) {
      return null;
    }

    // Support both old and new team ID formats during migration
    const awayTeamId = String(currentGame?.awayTeam?.id || currentGame?.awayTeam?.teamId);
    const homeTeamId = String(currentGame?.homeTeam?.id || currentGame?.homeTeam?.teamId);
    const gameStarted = currentGame?.gameStatus === 2 || currentGame?.gameStatus === 3;

    const injuries = {
      away: [],
      home: []
    };

    // Process each team's injuries
    injuriesArray.forEach(teamInjuries => {
      const team = teamInjuries.team;
      const teamInjuriesList = teamInjuries.injuries;
      
      if (!team || !teamInjuriesList || !Array.isArray(teamInjuriesList)) {
        return;
      }

      const teamId = String(team.id);
      const isAwayTeam = teamId === awayTeamId;
      const isHomeTeam = teamId === homeTeamId;

      // Only process if this is one of the teams in the current game
      if (!isAwayTeam && !isHomeTeam) {
        return;
      }

      // Process each injury for this team
      teamInjuriesList.forEach(injury => {
        const athlete = injury.athlete;
        if (!athlete) return;

        // Extract player info
        const playerId = athlete.id;
        const playerName = athlete.displayName || athlete.fullName || athlete.shortName;
        
        if (!playerId || !playerName) return;

        // Extract status - priority: status field, type.description, details.fantasyStatus.description
        const status = injury.status || 
                      injury.type?.description || 
                      injury.details?.fantasyStatus?.description || 
                      'Unknown';

        // Build status text from details
        let statusText = '';
        if (injury.details) {
          const details = injury.details;
          const parts = [];
          
          if (details.type) parts.push(details.type);
          if (details.location) parts.push(details.location);
          if (details.detail) parts.push(details.detail);
          if (details.side && details.side !== 'Not Specified') parts.push(details.side);
          
          statusText = parts.join(' - ');
          
          // Add return date if available
          if (details.returnDate) {
            const returnDate = new Date(details.returnDate);
            statusText += ` (Return: ${returnDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`;
          }
        }

        const injuryData = {
          playerId: playerId,
          name: playerName,
          position: athlete.position?.abbreviation || athlete.position?.name || '',
          status: status,
          statusText: statusText || injury.status || '',
          date: injury.date || null,
          teamId: teamId,
          teamAbbreviation: team.abbreviation || '',
          teamName: team.displayName || ''
        };

        if (isAwayTeam) {
          injuries.away.push(injuryData);
        } else if (isHomeTeam) {
          injuries.home.push(injuryData);
        }
      });
    });

    // Only return if there are injuries
    if (injuries.away.length === 0 && injuries.home.length === 0) {
      return null;
    }

    return {
      away: injuries.away,
      home: injuries.home,
      gameStarted: gameStarted
    };
  }
}

module.exports = new GameTransformer();
