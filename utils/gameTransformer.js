/**
 * Game Data Transformer
 * Transforms NBA API response to simplified format for frontend
 */

class GameTransformer {
  /**
   * Transform scoreboard data to simplified format
   * @param {Object} scoreboardData - Raw NBA API scoreboard response
   * @returns {Object} Transformed data
   */
  transformScoreboard(scoreboardData) {
    if (!scoreboardData?.scoreboard) {
      return {
        date: new Date().toLocaleDateString('en-CA', { timeZone: 'GMT' }),
        totalGames: 0,
        games: []
      };
    }

    const { gameDate, games } = scoreboardData.scoreboard;

    return {
      date: new Date().toLocaleDateString('en-CA', { timeZone: 'GMT' }),
      totalGames: games?.length || 0,
      games: (games || []).map(game => this.transformGame(game))
    };
  }

  /**
   * Transform single game data
   * @param {Object} game - Raw game data from NBA API
   * @returns {Object} Transformed game data
   */
  transformGame(game) {
    return {
      gameId: game.gameId,
      gameCode: game.gameCode,
      gameStatusText: game.gameStatusText || 'Scheduled',
      gameStatus: game.gameStatus || 1,
      period: game.period || 0,
      gameClock: game.gameClock || '',
      gameTimeGMT: (() => {
        if (!game.gameTimeUTC) return null;
        // Parse the UTC time and output in ISO 8601 with 'Z', which is always GMT
        // or, if wanted in 'YYYY-MM-DD HH:mm:ss GMT' format:
        const date = new Date(game.gameTimeUTC);
        if (isNaN(date.getTime())) return null;
        // Example output: '2024-01-01 19:00:00 GMT'
        return date.toLocaleString('en-GB', { timeZone: 'GMT', hour12: false }).replace(',', '') + ' GMT';
      })(),
      gameEt: game.gameEt,
      homeTeam: this.transformTeam(game.homeTeam),
      awayTeam: this.transformTeam(game.awayTeam),
      gameLeaders: game.gameLeaders || null
    };
  }

  /**
   * Transform team data
   * @param {Object} team - Raw team data
   * @returns {Object} Transformed team data
   */
  transformTeam(team) {
    if (!team) return null;

    return {
      teamId: String(team.teamId),
      teamName: team.teamName,
      teamCity: team.teamCity,
      teamTricode: team.teamTricode,
      wins: team.wins || 0,
      losses: team.losses || 0,
      score: team.score || null,
      logo: `https://cdn.nba.com/logos/nba/${team.teamId}/global/L/logo.svg`,
      periods: team.periods || []
    };
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
    // Game status: 1 = Scheduled, 2 = In Progress, 3 = Final
    const statusMap = {
      1: { text: 'Scheduled at ' + gameTimeGMT, color: 'gray', isLive: false },
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
}

module.exports = new GameTransformer();

