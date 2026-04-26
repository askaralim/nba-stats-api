import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const logger = require('../../utils/logger.js');

describe('utils/logger', () => {
  it('exposes the standard pino level methods', () => {
    for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
      expect(typeof logger[level]).toBe('function');
    }
  });

  it('exposes a numeric level threshold', () => {
    expect(typeof logger.level).toBe('string');
    expect(typeof logger.levelVal).toBe('number');
    expect(logger.levelVal).toBeGreaterThanOrEqual(0);
  });

  it('attaches the service base field for downstream filtering', () => {
    // pino exposes `bindings()` to retrieve the base object on the root logger.
    const bindings = logger.bindings();
    expect(bindings.service).toBe('nba-stats-api');
  });
});
