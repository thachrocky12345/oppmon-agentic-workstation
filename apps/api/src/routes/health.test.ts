// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { healthRouter } from './health.js';

// Mock the db module
vi.mock('../lib/db.js', () => ({
  healthCheck: vi.fn(),
}));

import { healthCheck } from '../lib/db.js';

const app = express();
app.use('/api/health', healthRouter);

describe('Health Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/health', () => {
    it('returns healthy status when database is connected', async () => {
      vi.mocked(healthCheck).mockResolvedValueOnce(true);

      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'healthy');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('version');
      expect(res.body.checks).toHaveProperty('database', 'ok');
    });

    it('returns degraded status when database is not connected', async () => {
      vi.mocked(healthCheck).mockResolvedValueOnce(false);

      const res = await request(app).get('/api/health');

      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty('status', 'degraded');
      expect(res.body.checks).toHaveProperty('database', 'error');
    });
  });

  describe('GET /api/health/live', () => {
    it('returns liveness status', async () => {
      const res = await request(app).get('/api/health/live');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
    });
  });

  describe('GET /api/health/ready', () => {
    it('returns ready status when database is healthy', async () => {
      vi.mocked(healthCheck).mockResolvedValueOnce(true);

      const res = await request(app).get('/api/health/ready');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ready', true);
      expect(res.body.checks).toHaveProperty('database', true);
    });

    it('returns not ready when database is unhealthy', async () => {
      vi.mocked(healthCheck).mockResolvedValueOnce(false);

      const res = await request(app).get('/api/health/ready');

      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty('ready', false);
      expect(res.body.checks).toHaveProperty('database', false);
    });
  });
});
