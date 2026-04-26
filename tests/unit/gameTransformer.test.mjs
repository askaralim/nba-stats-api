import { describe, it, expect } from 'vitest';
import gameTransformer from '../../utils/gameTransformer.js';

describe('gameTransformer.mapStatus', () => {
  it('maps known ESPN status keys to internal codes', () => {
    expect(gameTransformer.mapStatus('STATUS_SCHEDULED')).toBe(1);
    expect(gameTransformer.mapStatus('STATUS_IN_PROGRESS')).toBe(2);
    expect(gameTransformer.mapStatus('STATUS_HALFTIME')).toBe(2);
    expect(gameTransformer.mapStatus('STATUS_END_PERIOD')).toBe(2);
    expect(gameTransformer.mapStatus('STATUS_FINAL')).toBe(3);
    expect(gameTransformer.mapStatus('STATUS_FINAL_OVERTIME')).toBe(3);
    expect(gameTransformer.mapStatus('STATUS_POSTPONED')).toBe(6);
  });

  it('falls back to scheduled (1) for unknown or empty inputs', () => {
    expect(gameTransformer.mapStatus('STATUS_UNKNOWN')).toBe(1);
    expect(gameTransformer.mapStatus('')).toBe(1);
    expect(gameTransformer.mapStatus(undefined)).toBe(1);
  });
});

describe('gameTransformer.parseRecord', () => {
  it('parses W-L strings', () => {
    expect(gameTransformer.parseRecord('24-1')).toEqual({ wins: 24, losses: 1 });
    expect(gameTransformer.parseRecord('0-0')).toEqual({ wins: 0, losses: 0 });
  });

  it('returns zeros for empty/null input', () => {
    expect(gameTransformer.parseRecord('')).toEqual({ wins: 0, losses: 0 });
    expect(gameTransformer.parseRecord(null)).toEqual({ wins: 0, losses: 0 });
    expect(gameTransformer.parseRecord(undefined)).toEqual({ wins: 0, losses: 0 });
  });

  it('handles malformed strings safely', () => {
    expect(gameTransformer.parseRecord('abc-xyz')).toEqual({ wins: 0, losses: 0 });
    expect(gameTransformer.parseRecord('5')).toEqual({ wins: 5, losses: 0 });
  });
});

describe('gameTransformer.recordsAsArray', () => {
  it('returns the array unchanged when given an array', () => {
    const arr = [{ type: 'total', summary: '24-1' }];
    expect(gameTransformer.recordsAsArray(arr)).toBe(arr);
  });

  it('wraps a single ESPN postseason record object in an array', () => {
    const obj = { type: 'total', summary: '4-2' };
    expect(gameTransformer.recordsAsArray(obj)).toEqual([obj]);
  });

  it('returns [] for null/undefined/primitive', () => {
    expect(gameTransformer.recordsAsArray(null)).toEqual([]);
    expect(gameTransformer.recordsAsArray(undefined)).toEqual([]);
    expect(gameTransformer.recordsAsArray(42)).toEqual([]);
    expect(gameTransformer.recordsAsArray('record')).toEqual([]);
  });
});

describe('gameTransformer.isOvertimeGame', () => {
  it('detects OT via period > 4', () => {
    expect(gameTransformer.isOvertimeGame({ period: 5 })).toBe(true);
    expect(gameTransformer.isOvertimeGame({ period: 4 })).toBeFalsy();
  });

  it('detects OT via gameStatusText', () => {
    expect(gameTransformer.isOvertimeGame({ gameStatusText: 'Final/OT' })).toBe(true);
    expect(gameTransformer.isOvertimeGame({ gameStatusText: 'Overtime' })).toBe(true);
    expect(gameTransformer.isOvertimeGame({ gameStatusText: 'Final' })).toBe(false);
  });

  it('returns false for missing fields', () => {
    expect(gameTransformer.isOvertimeGame({})).toBeFalsy();
    expect(gameTransformer.isOvertimeGame(null)).toBeFalsy();
  });
});

describe('gameTransformer.isMarqueeMatchup', () => {
  it('flags any game involving GS or LAL', () => {
    expect(
      gameTransformer.isMarqueeMatchup({
        awayTeam: { abbreviation: 'gs' },
        homeTeam: { abbreviation: 'NYK' },
      })
    ).toBe(true);
    expect(
      gameTransformer.isMarqueeMatchup({
        awayTeam: { abbreviation: 'BOS' },
        homeTeam: { abbreviation: 'LAL' },
      })
    ).toBe(true);
  });

  it('flags configured rivalries (OKC-DEN both directions)', () => {
    expect(
      gameTransformer.isMarqueeMatchup({
        awayTeam: { abbreviation: 'OKC' },
        homeTeam: { abbreviation: 'DEN' },
      })
    ).toBe(true);
    expect(
      gameTransformer.isMarqueeMatchup({
        awayTeam: { abbreviation: 'DEN' },
        homeTeam: { abbreviation: 'OKC' },
      })
    ).toBe(true);
  });

  it('returns false for unrelated matchups and missing abbreviations', () => {
    expect(
      gameTransformer.isMarqueeMatchup({
        awayTeam: { abbreviation: 'NYK' },
        homeTeam: { abbreviation: 'CHA' },
      })
    ).toBe(false);
    expect(gameTransformer.isMarqueeMatchup({})).toBe(false);
  });
});

describe('gameTransformer.getScoreDifference', () => {
  it('returns null for scheduled games', () => {
    const game = {
      gameStatus: 1,
      awayTeam: { score: 0 },
      homeTeam: { score: 0 },
    };
    expect(gameTransformer.getScoreDifference(game)).toBeNull();
  });

  it('returns null for 0-0 (treated as not-yet-scored)', () => {
    const game = {
      gameStatus: 2,
      awayTeam: { score: 0 },
      homeTeam: { score: 0 },
    };
    expect(gameTransformer.getScoreDifference(game)).toBeNull();
  });

  it('returns absolute score difference for live and finished games', () => {
    expect(
      gameTransformer.getScoreDifference({
        gameStatus: 2,
        awayTeam: { score: 88 },
        homeTeam: { score: 92 },
      })
    ).toBe(4);
    expect(
      gameTransformer.getScoreDifference({
        gameStatus: 3,
        awayTeam: { score: 110 },
        homeTeam: { score: 100 },
      })
    ).toBe(10);
  });
});

describe('gameTransformer.isClosestGame', () => {
  it('returns false for scheduled games regardless of "score"', () => {
    expect(
      gameTransformer.isClosestGame({
        gameStatus: 1,
        awayTeam: { score: 0 },
        homeTeam: { score: 0 },
      })
    ).toBe(false);
  });

  it('returns true when finished game margin <= 5', () => {
    expect(
      gameTransformer.isClosestGame({
        gameStatus: 3,
        awayTeam: { score: 102 },
        homeTeam: { score: 100 },
      })
    ).toBe(true);
  });

  it('returns false when margin > 5', () => {
    expect(
      gameTransformer.isClosestGame({
        gameStatus: 3,
        awayTeam: { score: 120 },
        homeTeam: { score: 100 },
      })
    ).toBe(false);
  });
});

describe('gameTransformer.getGamePriority', () => {
  const baseTeams = (a, h, aScore = 0, hScore = 0) => ({
    awayTeam: { abbreviation: a, score: aScore },
    homeTeam: { abbreviation: h, score: hScore },
  });

  it('ranks live marquee highest (1)', () => {
    expect(
      gameTransformer.getGamePriority({
        gameStatus: 2,
        ...baseTeams('GS', 'NYK', 60, 62),
      })
    ).toBe(1);
  });

  it('ranks live closest (2) above live OT (3)', () => {
    const liveClosest = gameTransformer.getGamePriority({
      gameStatus: 2,
      ...baseTeams('NYK', 'CHA', 70, 73),
    });
    const liveOt = gameTransformer.getGamePriority({
      gameStatus: 2,
      period: 5,
      ...baseTeams('NYK', 'CHA', 110, 95),
    });
    expect(liveClosest).toBe(2);
    expect(liveOt).toBe(3);
    expect(liveClosest).toBeLessThan(liveOt);
  });

  it('ranks scheduled games (7) above regular finished (8)', () => {
    expect(
      gameTransformer.getGamePriority({
        gameStatus: 1,
        ...baseTeams('NYK', 'CHA'),
      })
    ).toBe(7);
    expect(
      gameTransformer.getGamePriority({
        gameStatus: 3,
        ...baseTeams('NYK', 'CHA', 120, 100),
      })
    ).toBe(8);
  });
});

describe('gameTransformer.calculateGIS', () => {
  const player = (overrides = {}) => ({
    stats: {
      points: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      fouls: 0,
      defensiveRebounds: 0,
      offensiveRebounds: 0,
      fieldGoals: '0-0',
      freeThrows: '0-0',
      threePointers: '0-0',
      ...overrides,
    },
  });

  it('returns 0 for missing stats', () => {
    expect(gameTransformer.calculateGIS(null, false)).toBe(0);
    expect(gameTransformer.calculateGIS({}, false)).toBe(0);
  });

  it('returns a number rounded to 1 decimal', () => {
    const score = gameTransformer.calculateGIS(
      player({ points: 10, rebounds: 4, assists: 2, fieldGoals: '4-7' }),
      false
    );
    expect(typeof score).toBe('number');
    expect(Number((score * 10).toFixed(0))).toBe(score * 10);
  });

  it('adds the +2 win bonus when teamWon is true', () => {
    const stats = { points: 20, rebounds: 5, assists: 5, fieldGoals: '8-15' };
    const win = gameTransformer.calculateGIS(player(stats), true);
    const loss = gameTransformer.calculateGIS(player(stats), false);
    expect(win - loss).toBeCloseTo(2, 1);
  });

  it('rewards triple-doubles with the +3 milestone bonus', () => {
    const noTd = gameTransformer.calculateGIS(
      player({ points: 10, rebounds: 10, assists: 10, fieldGoals: '4-10' }),
      false
    );
    const triple = gameTransformer.calculateGIS(
      player({ points: 11, rebounds: 11, assists: 11, fieldGoals: '4-10' }),
      false
    );
    expect(triple).toBeGreaterThan(noTd);
  });

  it('penalizes poor shooting on volume', () => {
    const efficient = gameTransformer.calculateGIS(
      player({ points: 12, rebounds: 4, assists: 2, fieldGoals: '6-12' }),
      false
    );
    const inefficient = gameTransformer.calculateGIS(
      player({ points: 12, rebounds: 4, assists: 2, fieldGoals: '4-15' }),
      false
    );
    expect(inefficient).toBeLessThan(efficient);
  });
});

describe('gameTransformer.calculateGameMVP', () => {
  const players = [
    { athleteId: 'a', name: 'A Player', teamId: 'home', stats: { points: 30, rebounds: 5, assists: 5, steals: 0, blocks: 0, turnovers: 2, fouls: 1, fieldGoals: '11-20', freeThrows: '6-7', threePointers: '2-5', defensiveRebounds: 4, offensiveRebounds: 1 } },
    { athleteId: 'b', name: 'B Player', teamId: 'home', stats: { points: 12, rebounds: 8, assists: 10, steals: 2, blocks: 1, turnovers: 3, fouls: 2, fieldGoals: '5-9', freeThrows: '0-0', threePointers: '2-4', defensiveRebounds: 6, offensiveRebounds: 2 } },
    { athleteId: 'c', name: 'C Player', teamId: 'away', stats: { points: 35, rebounds: 12, assists: 4, steals: 1, blocks: 2, turnovers: 4, fouls: 3, fieldGoals: '13-25', freeThrows: '7-9', threePointers: '2-6', defensiveRebounds: 9, offensiveRebounds: 3 } },
  ];

  it('returns null for empty input', () => {
    expect(gameTransformer.calculateGameMVP([], [], 'home')).toBeNull();
    expect(gameTransformer.calculateGameMVP(null, [], 'home')).toBeNull();
  });

  it('picks the highest-GIS player from the winning team only', () => {
    const mvp = gameTransformer.calculateGameMVP(players, [], 'home');
    expect(mvp).toBeTruthy();
    expect(['a', 'b']).toContain(mvp.athleteId);
    expect(mvp.teamId).toBe('home');
    expect(typeof mvp.gis).toBe('number');
  });

  it('falls back to all players when winning team has no eligible players', () => {
    const mvp = gameTransformer.calculateGameMVP(players, [], 'mystery');
    expect(mvp).toBeTruthy();
    expect(['a', 'b', 'c']).toContain(mvp.athleteId);
  });
});
