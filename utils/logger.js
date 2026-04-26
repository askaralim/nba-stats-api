/**
 * Shared pino logger.
 *
 * - JSON output in production (Railway parses it natively).
 * - pino-pretty transport in development for readable local logs.
 * - Level controlled by LOG_LEVEL env var; defaults to 'info'.
 * - Per-request child loggers are created by pino-http (req.log) and
 *   inherit these base fields automatically.
 */

const pino = require('pino');

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const level = process.env.LOG_LEVEL || (isTest ? 'silent' : 'info');

const baseConfig = {
  level,
  base: {
    service: 'nba-stats-api',
    env: process.env.NODE_ENV || 'development',
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
};

const transport = isProduction
  ? undefined
  : {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname,service,env',
      },
    };

const logger = pino({
  ...baseConfig,
  ...(transport ? { transport } : {}),
});

module.exports = logger;
