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
