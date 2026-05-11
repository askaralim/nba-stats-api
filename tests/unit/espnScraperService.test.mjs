import { describe, it, expect } from 'vitest';
import espnScraperService from '../../services/espnScraperService.js';
import seasonDefaults from '../../config/seasonDefaults.js';

describe('espnScraperService.parseSeason', () => {
  it('returns defaults when season is null/undefined/empty', () => {
    const expected = (() => {
      const [yearStr, typeStr] = seasonDefaults.ESPN_PLAYER_STATS_SEASON.split('|');
      return {
        year: parseInt(yearStr, 10) || seasonDefaults.STANDINGS_YEAR,
        seasonType: typeStr ? parseInt(typeStr, 10) : seasonDefaults.STANDINGS_TYPE,
      };
    })();

    expect(espnScraperService.parseSeason(null)).toEqual(expected);
    expect(espnScraperService.parseSeason(undefined)).toEqual(expected);
    expect(espnScraperService.parseSeason('')).toEqual(expected);
  });

  it('parses "year|type" tuples', () => {
    expect(espnScraperService.parseSeason('2026|2')).toEqual({ year: 2026, seasonType: 2 });
    expect(espnScraperService.parseSeason('2026|3')).toEqual({ year: 2026, seasonType: 3 });
  });

  it('parses bare year and falls back to default season type', () => {
    expect(espnScraperService.parseSeason('2026')).toEqual({
      year: 2026,
      seasonType: seasonDefaults.STANDINGS_TYPE,
    });
  });

  it('falls back to STANDINGS_YEAR when year is unparseable', () => {
    expect(espnScraperService.parseSeason('abc|2')).toEqual({
      year: seasonDefaults.STANDINGS_YEAR,
      seasonType: 2,
    });
  });
});

describe('espnScraperService.buildLeadersParamAttempts', () => {
  it('postseason (3) tries blank-season first then year-pinned, both with seasontype=3', () => {
    const attempts = espnScraperService.buildLeadersParamAttempts(3, 2026);
    expect(attempts).toEqual([
      { seasonYear: null, seasontype: 3 },
      { seasonYear: 2026, seasontype: 3 },
    ]);
  });

  it('regular season (2) tries 4 fallbacks ending at year-pinned with seasontype=2', () => {
    const attempts = espnScraperService.buildLeadersParamAttempts(2, 2026);
    expect(attempts).toEqual([
      { seasonYear: null, seasontype: 2 },
      { seasonYear: null, seasontype: null },
      { seasonYear: 2026, seasontype: null },
      { seasonYear: 2026, seasontype: 2 },
    ]);
  });

  it('unknown seasontype defaults to ESPN auto', () => {
    const attempts = espnScraperService.buildLeadersParamAttempts(undefined, 2026);
    expect(attempts).toEqual([
      { seasonYear: null, seasontype: null },
      { seasonYear: 2026, seasontype: null },
    ]);
  });
});

describe('espnScraperService.seasonTypeIdFromLeadersData', () => {
  it('extracts numeric requestedSeason.type', () => {
    expect(
      espnScraperService.seasonTypeIdFromLeadersData({ requestedSeason: { type: 3 } })
    ).toBe(3);
  });

  it('extracts nested object form', () => {
    expect(
      espnScraperService.seasonTypeIdFromLeadersData({
        requestedSeason: { type: { type: 2, id: 'reg' } },
      })
    ).toBe(2);
    expect(
      espnScraperService.seasonTypeIdFromLeadersData({
        requestedSeason: { type: { id: 3 } },
      })
    ).toBe(3);
  });

  it('falls back to 2 when requestedSeason is missing or non-numeric', () => {
    expect(espnScraperService.seasonTypeIdFromLeadersData({})).toBe(2);
    expect(espnScraperService.seasonTypeIdFromLeadersData(null)).toBe(2);
    expect(
      espnScraperService.seasonTypeIdFromLeadersData({ requestedSeason: { type: 'oops' } })
    ).toBe(2);
  });
});

describe('espnScraperService.buildEmptyTopPlayersByStat', () => {
  it('returns category keys with empty player arrays as fallback', () => {
    const empty = espnScraperService.buildEmptyTopPlayersByStat();
    expect(typeof empty).toBe('object');
    const keys = Object.keys(empty);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(Array.isArray(empty[k].players)).toBe(true);
      expect(empty[k].players.length).toBe(0);
      expect(typeof empty[k].title).toBe('string');
    }
  });
});

describe('espnScraperService.topPlayersByStatToSwishLeaders', () => {
  it('maps avgPoints/Rebounds/Assists blocks to points/rebounds/assists leader rows', () => {
    const topPlayersByStat = espnScraperService.buildEmptyTopPlayersByStat();
    topPlayersByStat.avgPoints.players.push({
      id: '1',
      name: 'A',
      team: 'Team',
      teamNameZhCN: '',
      headshot: null,
      stats: {
        avgPoints: { displayValue: '30.0', rank: 1 },
        gamesPlayed: {},
      },
    });
    topPlayersByStat.avgRebounds.players.push({
      id: '2',
      name: 'B',
      team: 'Team2',
      teamNameZhCN: '',
      headshot: null,
      stats: {
        avgRebounds: { displayValue: '12.0', rank: 1 },
        gamesPlayed: {},
      },
    });
    topPlayersByStat.avgAssists.players.push({
      id: '3',
      name: 'C',
      team: 'Team3',
      teamNameZhCN: '',
      headshot: null,
      stats: {
        avgAssists: { displayValue: '11.0', rank: 1 },
        gamesPlayed: {},
      },
    });
    const out = espnScraperService.topPlayersByStatToSwishLeaders(topPlayersByStat);
    expect(out.points[0].value).toBe('30.0');
    expect(out.rebounds[0].value).toBe('12.0');
    expect(out.assists[0].value).toBe('11.0');
    expect(out.points[0].statType).toBe('avgPoints');
  });
});

describe('espnScraperService.clampStatsPlayersLeadersLimit', () => {
  it('matches getPlayerStats clamp (min 9, max 100, default 20)', () => {
    expect(espnScraperService.clampStatsPlayersLeadersLimit(5)).toBe(9);
    expect(espnScraperService.clampStatsPlayersLeadersLimit(20)).toBe(20);
    expect(espnScraperService.clampStatsPlayersLeadersLimit(200)).toBe(100);
  });
});

describe('PLAYER_LEADER_CATEGORY_MAP export', () => {
  it('is exposed on the service for snapshot symmetry tests', () => {
    expect(Array.isArray(espnScraperService.PLAYER_LEADER_CATEGORY_MAP)).toBe(true);
    expect(espnScraperService.PLAYER_LEADER_CATEGORY_MAP.some((d) => d.statName === 'avgPoints')).toBe(
      true
    );
  });
});

describe('espnScraperService.buildTopPlayersByStatFromLeaderRows', () => {
  it('rebuilds categories from DB-shaped rows and fills missing stats as empty', () => {
    const samplePlayer = {
      id: '123',
      name: 'Test Player',
      headshot: null,
      team: 'Lakers',
      teamNameZhCN: '',
      teamCityZhCN: '',
      teamLogo: null,
      position: 'G',
      statRank: 1,
      stats: {
        avgPoints: {
          value: 28.5,
          rank: 1,
          displayValue: '28.5',
          label: '',
          displayName: '',
          description: '',
          category: 'leaders',
        },
        gamesPlayed: {
          value: null,
          rank: null,
          displayValue: '-',
          label: 'GP',
          displayName: 'Games Played',
          description: '',
          category: 'leaders',
        },
      },
    };
    const rows = [
      {
        stat_key: 'avgPoints',
        rank: 1,
        player_json: samplePlayer,
      },
    ];
    const rebuilt = espnScraperService.buildTopPlayersByStatFromLeaderRows(rows);
    expect(rebuilt.avgPoints.players).toHaveLength(1);
    expect(rebuilt.avgPoints.players[0]).toEqual(samplePlayer);
    expect(rebuilt.tripleDouble.players).toHaveLength(0);
    expect(rebuilt.tripleDouble.title).toBe('三双次数');
  });

  it('sorts by rank within a stat category', () => {
    const p1 = { statRank: 2, id: 'b', stats: {} };
    const p2 = { statRank: 1, id: 'a', stats: {} };
    const rows = [
      { stat_key: 'avgRebounds', rank: 2, player_json: p1 },
      { stat_key: 'avgRebounds', rank: 1, player_json: p2 },
    ];
    const rebuilt = espnScraperService.buildTopPlayersByStatFromLeaderRows(rows);
    expect(rebuilt.avgRebounds.players.map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('espnScraperService.buildSnapshotRows', () => {
  it('maps transformedData to meta + flat entries for persistence', () => {
    const transformedData = {
      metadata: {
        season: '2025-2026',
        seasonType: 'Regular Season',
        seasonTypeId: 2,
        position: 'All Positions',
        totalCount: 50,
      },
      topPlayersByStat: {
        avgPoints: {
          title: '场均得分',
          description: 'Points Per Game',
          players: [
            {
              id: '1',
              statRank: 1,
              stats: { avgPoints: { displayValue: '30.0' }, gamesPlayed: {} },
            },
          ],
        },
      },
    };
    const { meta, entries } = espnScraperService.buildSnapshotRows(transformedData, 2026, 2, 50);
    expect(meta).toMatchObject({
      season_year: 2026,
      season_type: 2,
      leaders_limit: 50,
      effective_season_type_id: 2,
      season_label: '2025-2026',
      total_count: 50,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ stat_key: 'avgPoints', rank: 1 });
    expect(entries[0].player_json.id).toBe('1');
  });

  it('round-trips through buildTopPlayersByStatFromLeaderRows', () => {
    const transformedData = {
      metadata: {
        seasonTypeId: 2,
        season: '2025-2026',
        seasonType: 'Regular Season',
        position: 'All Positions',
        totalCount: 9,
      },
      topPlayersByStat: espnScraperService.buildEmptyTopPlayersByStat(),
    };
    transformedData.topPlayersByStat.avgAssists.players.push({
      id: '99',
      name: 'Assist King',
      statRank: 1,
      stats: {},
    });
    const { entries } = espnScraperService.buildSnapshotRows(transformedData, 2026, 2, 50);
    const rows = entries.map((e) => ({
      stat_key: e.stat_key,
      rank: e.rank,
      player_json: e.player_json,
    }));
    const rebuilt = espnScraperService.buildTopPlayersByStatFromLeaderRows(rows);
    expect(rebuilt.avgAssists.players[0].name).toBe('Assist King');
  });
});
