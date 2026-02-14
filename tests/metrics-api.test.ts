import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { metricsRouter } from '../src/metrics/api.js';
import { metricsCollector } from '../src/metrics/collector.js';

describe('Metrics API', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/metrics', metricsRouter);
    
    metricsCollector.clear();
    metricsCollector.configure({
      enabled: true,
      maxHistory: 100,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('authentication', () => {
    it('should return 503 when metrics disabled', async () => {
      metricsCollector.configure({ enabled: false });

      const response = await request(app).get('/api/metrics/health');
      
      expect(response.status).toBe(503);
      expect(response.body.error).toBe('Metrics not enabled');
    });

    it('should allow requests without API key when not configured', async () => {
      const response = await request(app).get('/api/metrics/health');
      
      expect(response.status).toBe(200);
    });

    it('should reject requests without Authorization header when API key configured', async () => {
      metricsCollector.configure({ enabled: true, apiKey: 'secret-key' });

      const response = await request(app).get('/api/metrics/health');
      
      expect(response.status).toBe(401);
      expect(response.body.error).toContain('authorization');
    });

    it('should reject requests with invalid API key', async () => {
      metricsCollector.configure({ enabled: true, apiKey: 'secret-key' });

      const response = await request(app)
        .get('/api/metrics/health')
        .set('Authorization', 'Bearer wrong-key');
      
      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Invalid API key');
    });

    it('should accept requests with valid API key', async () => {
      metricsCollector.configure({ enabled: true, apiKey: 'secret-key' });

      const response = await request(app)
        .get('/api/metrics/health')
        .set('Authorization', 'Bearer secret-key');
      
      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/metrics/health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/metrics/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('totalQueries');
    });

    it('should return healthy status with no errors', async () => {
      for (let i = 0; i < 5; i++) {
        metricsCollector.record({
          query: `Query ${i}`,
          contextBytes: 100,
          model: 'gpt-4',
          iterations: 1,
          tokensIn: 50,
          tokensOut: 10,
          cost: 0.001,
          durationMs: 500,
          success: true,
        });
      }

      const response = await request(app).get('/api/metrics/health');
      
      expect(response.body.status).toBe('healthy');
      expect(response.body.totalQueries).toBe(5);
    });
  });

  describe('GET /api/metrics/stats', () => {
    beforeEach(() => {
      // Add test data
      for (let i = 0; i < 10; i++) {
        metricsCollector.record({
          query: `Query ${i}`,
          contextBytes: 100,
          model: i % 2 === 0 ? 'gpt-4' : 'claude-3',
          iterations: 1,
          tokensIn: 50,
          tokensOut: 10,
          cost: 0.01,
          durationMs: 1000,
          success: i !== 5, // 1 failure
        });
      }
    });

    it('should return stats for default period (day)', async () => {
      const response = await request(app).get('/api/metrics/stats');
      
      expect(response.status).toBe(200);
      expect(response.body.queries).toBe(10);
      expect(response.body.cost).toBeCloseTo(0.1, 5);
      expect(response.body.avgDuration).toBe(1000);
      expect(response.body.errorRate).toBeCloseTo(0.1, 5);
    });

    it('should accept period parameter', async () => {
      const response = await request(app).get('/api/metrics/stats?period=week');
      
      expect(response.status).toBe(200);
      expect(response.body.queries).toBe(10);
    });

    it('should return breakdown by model', async () => {
      const response = await request(app).get('/api/metrics/stats');
      
      expect(response.body.byModel).toBeDefined();
      expect(response.body.byModel['gpt-4']).toBeDefined();
      expect(response.body.byModel['gpt-4'].queries).toBe(5);
    });
  });

  describe('GET /api/metrics/queries', () => {
    beforeEach(() => {
      for (let i = 0; i < 25; i++) {
        metricsCollector.record({
          query: `Query ${i}`,
          contextBytes: 100,
          model: i % 3 === 0 ? 'gpt-4' : 'claude-3',
          iterations: 1,
          tokensIn: 50,
          tokensOut: 10,
          cost: 0.01,
          durationMs: 1000,
          success: i % 4 !== 0,
        });
      }
    });

    it('should return queries with pagination info', async () => {
      const response = await request(app).get('/api/metrics/queries');
      
      expect(response.status).toBe(200);
      expect(response.body.queries).toBeDefined();
      expect(response.body.total).toBe(25);
      expect(Array.isArray(response.body.queries)).toBe(true);
    });

    it('should support limit parameter', async () => {
      const response = await request(app).get('/api/metrics/queries?limit=5');
      
      expect(response.body.queries.length).toBe(5);
      expect(response.body.total).toBe(25);
    });

    it('should support offset parameter', async () => {
      const response = await request(app).get('/api/metrics/queries?limit=5&offset=20');
      
      expect(response.body.queries.length).toBe(5);
    });

    it('should filter by model', async () => {
      const response = await request(app).get('/api/metrics/queries?model=gpt-4');
      
      expect(response.body.queries.every((q: { model: string }) => q.model === 'gpt-4')).toBe(true);
    });

    it('should filter by success status', async () => {
      const successResponse = await request(app).get('/api/metrics/queries?success=true');
      const failResponse = await request(app).get('/api/metrics/queries?success=false');
      
      expect(successResponse.body.queries.every((q: { success: boolean }) => q.success === true)).toBe(true);
      expect(failResponse.body.queries.every((q: { success: boolean }) => q.success === false)).toBe(true);
    });

    it('should return query details in response', async () => {
      const response = await request(app).get('/api/metrics/queries?limit=1');
      
      const query = response.body.queries[0];
      expect(query).toHaveProperty('id');
      expect(query).toHaveProperty('timestamp');
      expect(query).toHaveProperty('query');
      expect(query).toHaveProperty('model');
      expect(query).toHaveProperty('cost');
      expect(query).toHaveProperty('durationMs');
      expect(query).toHaveProperty('success');
    });
  });

  describe('GET /api/metrics/queries/:id', () => {
    it('should return a single query by ID', async () => {
      const recorded = metricsCollector.record({
        query: 'Specific query',
        contextBytes: 100,
        model: 'gpt-4',
        iterations: 3,
        tokensIn: 500,
        tokensOut: 100,
        cost: 0.05,
        durationMs: 2500,
        success: true,
      });

      const response = await request(app).get(`/api/metrics/queries/${recorded.id}`);
      
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(recorded.id);
      expect(response.body.query).toBe('Specific query');
      expect(response.body.iterations).toBe(3);
    });

    it('should return 404 for non-existent query', async () => {
      const response = await request(app).get('/api/metrics/queries/non-existent-id');
      
      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('GET /api/metrics/content', () => {
    it('should return content placeholder', async () => {
      const response = await request(app).get('/api/metrics/content');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sources');
      expect(response.body).toHaveProperty('totalBytes');
      expect(response.body).toHaveProperty('healthScore');
    });
  });
});
