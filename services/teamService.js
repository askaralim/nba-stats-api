/**
 * Team Service (ESPN API)
 * Fetches team data and statistics from ESPN API endpoints
 */

const dateFormatter = require('../utils/dateFormatter');

class TeamService {
  constructor() {
    this.baseUrl = 'https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/teams';
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes cache
    
    // All 30 NBA team abbreviations
    this.allTeamAbbreviations = [
      'atl', 'bos', 'bkn', 'cha', 'chi', 'cle', 'dal', 'den', 'det', 'gs',
      'hou', 'ind', 'lac', 'lal', 'mem', 'mia', 'mil', 'min', 'no', 'ny',
      'okc', 'orl', 'phi', 'phx', 'por', 'sac', 'sa', 'tor', 'utah', 'was'
    ];
  }

  /**
   * Fetch team information
   * @param {string} teamAbbreviation - Team abbreviation (e.g., 'bos', 'lal')
   * @returns {Promise<Object>} Team information
   */
  async getTeamInfo(teamAbbreviation) {
    const cacheKey = `team_info_${teamAbbreviation}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const url = `${this.baseUrl}/${teamAbbreviation.toLowerCase()}?region=us&lang=en`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Cache the response
      this.cache.set(cacheKey, {
        data: data.team,
        timestamp: Date.now()
      });

      return data.team;
    } catch (error) {
      console.error(`Error fetching team info for ${teamAbbreviation}:`, error);
      throw error;
    }
  }

  /**
   * Fetch team statistics and player statistics
   * @param {string} teamAbbreviation - Team abbreviation (e.g., 'bos', 'lal')
   * @returns {Promise<Object>} Team statistics with players
   */
  async getTeamStatistics(teamAbbreviation) {
    const cacheKey = `team_stats_${teamAbbreviation}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const url = `${this.baseUrl}/${teamAbbreviation.toLowerCase()}/athletes/statistics?region=us&lang=en&contentorigin=espn`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Cache the response
      this.cache.set(cacheKey, {
        data: data,
        timestamp: Date.now()
      });

      return data;
    } catch (error) {
      console.error(`Error fetching team statistics for ${teamAbbreviation}:`, error);
      throw error;
    }
  }

  /**
   * Fetch team schedule
   * @param {string} teamAbbreviation - Team abbreviation (e.g., 'bos', 'lal')
   * @param {number} seasonType - Season type (2 = regular season, 3 = playoffs)
   * @returns {Promise<Object>} Team schedule data
   */
  async getTeamSchedule(teamAbbreviation, seasonType = 2) {
    const cacheKey = `team_schedule_${teamAbbreviation}_${seasonType}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const url = `${this.baseUrl}/${teamAbbreviation.toLowerCase()}/schedule?region=us&lang=en&seasontype=${seasonType}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Cache the response
      this.cache.set(cacheKey, {
        data: data,
        timestamp: Date.now()
      });

      return data;
    } catch (error) {
      console.error(`Error fetching team schedule for ${teamAbbreviation}:`, error);
      throw error;
    }
  }

  /**
   * Extract and transform team leaders from statistics
   * Returns only what frontend needs: offense and defense leaders
   * @param {string} teamAbbreviation - Team abbreviation (e.g., 'bos', 'lal')
   * @returns {Promise<Object>} Transformed team leaders data
   */
  async getTeamLeaders(teamAbbreviation) {
    const cacheKey = `team_leaders_${teamAbbreviation}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const statsData = await this.getTeamStatistics(teamAbbreviation);
      const results = statsData.results || [];
      
      const leaders = {
        offense: {
          points: null,
          assists: null,
          fieldGoalPct: null
        },
        defense: {
          rebounds: null,
          steals: null,
          blocks: null
        }
      };

      // Extract all players with their stats from results
      const players = [];
      results.forEach(category => {
        if (!category?.leaders || !Array.isArray(category.leaders)) {
          return;
        }

        category.leaders.forEach(leader => {
          if (!leader?.athlete) return;

          const athlete = leader.athlete;
          const playerId = athlete.id;
          
          // Check if we already have this player
          let player = players.find(p => p.id === playerId);
          if (!player) {
            player = {
              id: playerId,
              name: athlete.fullName || athlete.displayName || athlete.shortName || 'Unknown',
              position: athlete.position?.abbreviation || athlete.position?.name || '-',
              jersey: athlete.jersey ? String(athlete.jersey) : '',
              headshot: athlete.headshot?.href || null,
              stats: {}
            };
            players.push(player);
          }

          // Extract stats from leader.statistics
          if (Array.isArray(leader.statistics)) {
            leader.statistics.forEach(statCategory => {
              if (Array.isArray(statCategory?.stats)) {
                statCategory.stats.forEach(stat => {
                  if (stat?.name) {
                    const value = stat.displayValue || stat.value;
                    player.stats[stat.name] = typeof value === 'object'
                      ? (value.displayValue || value.value || '-')
                      : (value || '-');
                  }
                });
              }
            });
          }
        });
      });

      // Helper to get stat value as number for sorting
      const getStatValue = (statName, player) => {
        const value = player.stats[statName];
        if (value === undefined || value === '-' || value === null) return -Infinity;
        const num = parseFloat(value);
        return isNaN(num) ? -Infinity : num;
      };

      // Find leaders for each stat
      if (players.length > 0) {
        // Points leader
        const pointsLeader = [...players].sort((a, b) => getStatValue('avgPoints', b) - getStatValue('avgPoints', a))[0];
        if (pointsLeader && getStatValue('avgPoints', pointsLeader) > -Infinity) {
          leaders.offense.points = {
            id: pointsLeader.id,
            name: pointsLeader.name,
            position: pointsLeader.position,
            jersey: pointsLeader.jersey,
            headshot: pointsLeader.headshot,
            mainStat: pointsLeader.stats.avgPoints || '-',
            additionalStats: pointsLeader.stats
          };
        }

        // Assists leader
        const assistsLeader = [...players].sort((a, b) => getStatValue('avgAssists', b) - getStatValue('avgAssists', a))[0];
        if (assistsLeader && getStatValue('avgAssists', assistsLeader) > -Infinity) {
          leaders.offense.assists = {
            id: assistsLeader.id,
            name: assistsLeader.name,
            position: assistsLeader.position,
            jersey: assistsLeader.jersey,
            headshot: assistsLeader.headshot,
            mainStat: assistsLeader.stats.avgAssists || '-',
            additionalStats: assistsLeader.stats
          };
        }

        // Field Goal % leader
        const fgPctLeader = [...players].sort((a, b) => getStatValue('fieldGoalPct', b) - getStatValue('fieldGoalPct', a))[0];
        if (fgPctLeader && getStatValue('fieldGoalPct', fgPctLeader) > -Infinity) {
          leaders.offense.fieldGoalPct = {
            id: fgPctLeader.id,
            name: fgPctLeader.name,
            position: fgPctLeader.position,
            jersey: fgPctLeader.jersey,
            headshot: fgPctLeader.headshot,
            mainStat: fgPctLeader.stats.fieldGoalPct || '-',
            additionalStats: fgPctLeader.stats
          };
        }

        // Rebounds leader
        const reboundsLeader = [...players].sort((a, b) => getStatValue('avgRebounds', b) - getStatValue('avgRebounds', a))[0];
        if (reboundsLeader && getStatValue('avgRebounds', reboundsLeader) > -Infinity) {
          leaders.defense.rebounds = {
            id: reboundsLeader.id,
            name: reboundsLeader.name,
            position: reboundsLeader.position,
            jersey: reboundsLeader.jersey,
            headshot: reboundsLeader.headshot,
            mainStat: reboundsLeader.stats.avgRebounds || '-',
            additionalStats: reboundsLeader.stats
          };
        }

        // Steals leader
        const stealsLeader = [...players].sort((a, b) => getStatValue('avgSteals', b) - getStatValue('avgSteals', a))[0];
        if (stealsLeader && getStatValue('avgSteals', stealsLeader) > -Infinity) {
          leaders.defense.steals = {
            id: stealsLeader.id,
            name: stealsLeader.name,
            position: stealsLeader.position,
            jersey: stealsLeader.jersey,
            headshot: stealsLeader.headshot,
            mainStat: stealsLeader.stats.avgSteals || '-',
            additionalStats: stealsLeader.stats
          };
        }

        // Blocks leader
        const blocksLeader = [...players].sort((a, b) => getStatValue('avgBlocks', b) - getStatValue('avgBlocks', a))[0];
        if (blocksLeader && getStatValue('avgBlocks', blocksLeader) > -Infinity) {
          leaders.defense.blocks = {
            id: blocksLeader.id,
            name: blocksLeader.name,
            position: blocksLeader.position,
            jersey: blocksLeader.jersey,
            headshot: blocksLeader.headshot,
            mainStat: blocksLeader.stats.avgBlocks || '-',
            additionalStats: blocksLeader.stats
          };
        }
      }

      // Cache the transformed result
      this.cache.set(cacheKey, {
        data: leaders,
        timestamp: Date.now()
      });

      return leaders;
    } catch (error) {
      console.error(`Error extracting team leaders for ${teamAbbreviation}:`, error);
      throw error;
    }
  }

  /**
   * Extract and transform recent games from schedule
   * Returns only what frontend needs: last 5 completed games and next 3 upcoming games
   * @param {string} teamAbbreviation - Team abbreviation (e.g., 'bos', 'lal')
   * @param {string} teamId - Team ID for determining win/loss
   * @param {number} seasonType - Season type (2 = regular season, 3 = playoffs)
   * @returns {Promise<Object>} Transformed recent games data
   */
  async getRecentGames(teamAbbreviation, teamId, seasonType = 2) {
    const cacheKey = `team_recent_games_${teamAbbreviation}_${seasonType}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const scheduleData = await this.getTeamSchedule(teamAbbreviation, seasonType);
      const events = scheduleData.events || [];

      // Helper to extract score value
      const getScoreValue = (scoreObj) => {
        if (!scoreObj) return '0';
        if (typeof scoreObj === 'string' || typeof scoreObj === 'number') {
          return String(scoreObj);
        }
        if (typeof scoreObj === 'object') {
          return String(scoreObj.displayValue || scoreObj.value || '0');
        }
        return '0';
      };

      // Get last 5 completed games
      const completedGames = events
        .filter(event => event?.competitions?.[0]?.status?.type?.completed === true)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5)
        .map(event => {
          const competition = event.competitions?.[0];
          const teams = competition?.competitors || [];
          const homeTeam = teams.find(t => t?.homeAway === 'home');
          const awayTeam = teams.find(t => t?.homeAway === 'away');
          
          const homeScore = getScoreValue(homeTeam?.score);
          const awayScore = getScoreValue(awayTeam?.score);
          const teamScore = teams.find(t => t?.team?.id === teamId)?.score;
          const opponentScore = teams.find(t => t?.team?.id !== teamId)?.score;
          const teamScoreValue = getScoreValue(teamScore);
          const opponentScoreValue = getScoreValue(opponentScore);
          const won = teamScoreValue && opponentScoreValue ? parseInt(teamScoreValue) > parseInt(opponentScoreValue) : null;

          return {
            id: event.id,
            date: event.date,
            dateFormatted: event.date 
              ? dateFormatter.formatScheduleDate(event.date, { locale: 'zh-CN', timezone: 'Asia/Shanghai' })
              : null,
            homeTeam: {
              name: homeTeam?.team?.displayName || homeTeam?.team?.name || 'Unknown',
              abbreviation: homeTeam?.team?.abbreviation || '',
              score: homeScore
            },
            awayTeam: {
              name: awayTeam?.team?.displayName || awayTeam?.team?.name || 'Unknown',
              abbreviation: awayTeam?.team?.abbreviation || '',
              score: awayScore
            },
            won,
            status: competition?.status?.type?.description || 'Completed'
          };
        });

      // Get next 3 upcoming games
      const upcomingGames = events
        .filter(event => {
          const status = event?.competitions?.[0]?.status?.type;
          return status && !status.completed && status.id !== '3'; // Not completed and not postponed
        })
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 3)
        .map(event => {
          const competition = event.competitions?.[0];
          const teams = competition?.competitors || [];
          const homeTeam = teams.find(t => t?.homeAway === 'home');
          const awayTeam = teams.find(t => t?.homeAway === 'away');

          return {
            id: event.id,
            date: event.date,
            dateFormatted: event.date 
              ? dateFormatter.formatScheduleDate(event.date, { locale: 'zh-CN', timezone: 'Asia/Shanghai' })
              : null,
            homeTeam: {
              name: homeTeam?.team?.displayName || homeTeam?.team?.name || 'Unknown',
              abbreviation: homeTeam?.team?.abbreviation || ''
            },
            awayTeam: {
              name: awayTeam?.team?.displayName || awayTeam?.team?.name || 'Unknown',
              abbreviation: awayTeam?.team?.abbreviation || ''
            },
            status: competition?.status?.type?.description || 'Scheduled'
          };
        });

      const result = {
        last5Games: completedGames,
        next3Games: upcomingGames
      };

      // Cache the transformed result
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });

      return result;
    } catch (error) {
      console.error(`Error extracting recent games for ${teamAbbreviation}:`, error);
      throw error;
    }
  }

  /**
   * Fetch all teams' statistics and calculate league-wide rankings
   * @param {boolean} forceRefresh - If true, bypass cache and fetch fresh data
   * @returns {Promise<Object>} Rankings object with stat names as keys and arrays of {teamId, value, rank} as values
   */
  async getAllTeamsStatRankings(forceRefresh = false) {
    const cacheKey = 'all_teams_stat_rankings';
    const cached = this.cache.get(cacheKey);
    
    if (cached && !forceRefresh && Date.now() - cached.timestamp < this.cacheTimeout * 2) {
      return cached.data; // Cache rankings for 10 minutes (2x normal cache)
    }

    try {
      console.log('[TeamService] Calculating league-wide stat rankings...');
      
      // Fetch statistics for all teams in parallel (with concurrency limit)
      const batchSize = 5; // Smaller batch for stats (more data)
      const allTeamStats = new Map(); // teamAbbr -> stats object
      
      for (let i = 0; i < this.allTeamAbbreviations.length; i += batchSize) {
        const batch = this.allTeamAbbreviations.slice(i, i + batchSize);
        
        await Promise.allSettled(
          batch.map(async (abbr) => {
            try {
              const stats = await this.getTeamStatistics(abbr);
              const teamTotals = {};
              
              if (stats.teamTotals && Array.isArray(stats.teamTotals)) {
                stats.teamTotals.forEach(category => {
                  if (Array.isArray(category.stats)) {
                    category.stats.forEach(stat => {
                      // Extract numeric value for ranking
                      const value = stat.value !== null && stat.value !== undefined 
                        ? parseFloat(stat.value) 
                        : null;
                      teamTotals[stat.name] = {
                        displayValue: stat.displayValue || stat.value || '-',
                        value: value
                      };
                    });
                  }
                });
              }
              
              allTeamStats.set(abbr, teamTotals);
            } catch (error) {
              console.error(`[TeamService] Failed to fetch stats for ${abbr}:`, error.message);
            }
          })
        );
        
        // Small delay between batches
        if (i + batchSize < this.allTeamAbbreviations.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      // Calculate rankings for each stat
      const rankings = {};
      
      // Stat names to rank (matching frontend display)
      const statNames = [
        'avgPoints', 'avgRebounds', 'avgAssists', 'avgSteals', 'avgBlocks',
        'fieldGoalPct', 'threePointPct', 'freeThrowPct', 'avgTurnovers'
      ];
      
      statNames.forEach(statName => {
        const teamsWithStat = [];
        
        // Collect all teams with this stat
        allTeamStats.forEach((stats, abbr) => {
          const stat = stats[statName];
          if (stat && stat.value !== null && !isNaN(stat.value)) {
            teamsWithStat.push({
              teamAbbr: abbr,
              value: stat.value
            });
          }
        });
        
        // Sort by value (descending for most stats, ascending for turnovers)
        const isAscending = statName === 'avgTurnovers'; // Lower is better for turnovers
        teamsWithStat.sort((a, b) => {
          return isAscending ? a.value - b.value : b.value - a.value;
        });
        
        // Assign ranks (handle ties)
        const ranked = [];
        let currentRank = 1;
        for (let i = 0; i < teamsWithStat.length; i++) {
          if (i > 0 && teamsWithStat[i].value !== teamsWithStat[i - 1].value) {
            currentRank = i + 1;
          }
          ranked.push({
            teamAbbr: teamsWithStat[i].teamAbbr,
            value: teamsWithStat[i].value,
            rank: currentRank
          });
        }
        
        rankings[statName] = ranked;
      });

      // Cache the rankings
      this.cache.set(cacheKey, {
        data: rankings,
        timestamp: Date.now()
      });

      console.log('[TeamService] Stat rankings calculated successfully');
      return rankings;
    } catch (error) {
      console.error('[TeamService] Error calculating stat rankings:', error);
      throw error;
    }
  }

  /**
   * Get ranking for a specific team and stat
   * @param {string} teamAbbreviation - Team abbreviation
   * @param {string} statName - Stat name
   * @param {Object} rankings - Rankings object from getAllTeamsStatRankings
   * @returns {number|null} Rank (1-based) or null if not found
   */
  getTeamStatRank(teamAbbreviation, statName, rankings) {
    if (!rankings || !rankings[statName]) return null;
    
    const ranking = rankings[statName].find(r => r.teamAbbr === teamAbbreviation.toLowerCase());
    return ranking ? ranking.rank : null;
  }

  /**
   * Pre-fetch all team info for all 30 NBA teams
   * @param {boolean} forceRefresh - If true, bypass cache and fetch fresh data
   * @returns {Promise<Object>} Object with success count and errors
   */
  async prefetchAllTeamInfo(forceRefresh = false) {
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    console.log(`[TeamService] Pre-fetching team info for ${this.allTeamAbbreviations.length} teams...`);

    // Fetch all teams in parallel (with concurrency limit to avoid overwhelming the API)
    const batchSize = 10; // Process 10 teams at a time
    for (let i = 0; i < this.allTeamAbbreviations.length; i += batchSize) {
      const batch = this.allTeamAbbreviations.slice(i, i + batchSize);
      
      await Promise.allSettled(
        batch.map(async (abbr) => {
          try {
            if (forceRefresh) {
              // Force refresh by clearing cache first
              const cacheKey = `team_info_${abbr}`;
              this.cache.delete(cacheKey);
            }
            await this.getTeamInfo(abbr);
            results.success++;
          } catch (error) {
            results.failed++;
            results.errors.push({ team: abbr, error: error.message });
            console.error(`[TeamService] Failed to fetch team info for ${abbr}:`, error.message);
          }
        })
      );

      // Small delay between batches to be respectful to the API
      if (i + batchSize < this.allTeamAbbreviations.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`[TeamService] Pre-fetch completed: ${results.success} succeeded, ${results.failed} failed`);
    if (results.errors.length > 0) {
      console.error(`[TeamService] Errors:`, results.errors);
    }

    return results;
  }
}

module.exports = new TeamService();

