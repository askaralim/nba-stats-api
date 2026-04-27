import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const WebServer = require('../../server.js');

describe('HTTP API (integration)', () => {
  let app;

  beforeAll(() => {
    // server.js skips crons and startup pre-fetch when NODE_ENV=test
    const server = new WebServer(0);
    app = server.getApp();
  });

  it('GET /health returns 200 and success envelope', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.status).toBe('ok');
  });

  it('GET /api/v1/nba/teams returns teams list', async () => {
    const res = await request(app).get('/api/v1/nba/teams');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.teams)).toBe(true);
    expect(res.body.data.teams.length).toBeGreaterThan(0);
  });

  it('GET /api/v2/nba/translated-news returns JSON envelope', async () => {
    const res = await request(app)
      .get('/api/v2/nba/translated-news')
      .query({ page: 1, limit: 5 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.articles)).toBe(true);
  });

  it('GET /api/v1/nba/teams/by-id/:id returns team (read-through)', async () => {
    const listRes = await request(app).get('/api/v1/nba/teams');
    expect(listRes.status).toBe(200);
    const firstId = listRes.body.data.teams[0]?.id;
    expect(firstId).toBeDefined();

    const res = await request(app).get(`/api/v1/nba/teams/by-id/${firstId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.team).toBeDefined();
    expect(String(res.body.data.team.id)).toBe(String(firstId));
    expect(res.body.data.team.abbreviation).toBeDefined();
  });

  it('GET /api/v1/nba/teams/by-id/999999999 returns 404', async () => {
    const res = await request(app).get('/api/v1/nba/teams/by-id/999999999');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
