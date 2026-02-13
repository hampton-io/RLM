import { describe, it, expect, beforeEach } from 'vitest';
import { metricsCollector } from '../src/metrics/collector.js';

describe('MetricsCollector', () => {
  beforeEach(() => {
    metricsCollector.clear();
    metricsCollector.configure({
      enabled: true,
      maxHistory: 100,
    });
  });

  describe('configuration', () => {
    it('should be disabled by default', () => {
      metricsCollector.configure({ enabled: false });
      expect(metricsCollector.isEnabled()).toBe(false);
    });

    it('should enable when configured', () => {
      metricsCollector.configure({ enabled: true });
      expect(metricsCollector.isEnabled()).toBe(true);
    });

    it('should store API key', () => {
      metricsCollector.configure({ enabled: true, apiKey: 'test-key' });
      expect(metricsCollector.getApiKey()).toBe('test-key');
    });
  });

  describe('record', () => {
    it('should record a query metric', () => {
      const metric = metricsCollector.record({
        query: 'What is the meaning of life?',
        contextBytes: 1000,
        model: 'gpt-4',
        iterations: 3,
        tokensIn: 500,
        tokensOut: 100,
        cost: 0.01,
        durationMs: 2000,
        success: true,
      });

      expect(metric.id).toBeTruthy();
      expect(metric.timestamp).toBeInstanceOf(Date);
      expect(metric.query).toBe('What is the meaning of life?');
      expect(metric.success).toBe(true);
    });

    it('should not record when disabled', () => {
      metricsCollector.configure({ enabled: false });
      
      metricsCollector.record({
        query: 'test',
        contextBytes: 100,
        model: 'gpt-4',
        iterations: 1,
        tokensIn: 50,
        tokensOut: 10,
        cost: 0.001,
        durationMs: 500,
        success: true,
      });

      const { queries } = metricsCollector.getQueries();
      expect(queries.length).toBe(0);
    });

    it('should redact query text when configured', () => {
      metricsCollector.configure({ enabled: true, redactQueries: true });
      
      const metric = metricsCollector.record({
        query: 'Sensitive query with PII',
        contextBytes: 100,
        model: 'gpt-4',
        iterations: 1,
        tokensIn: 50,
        tokensOut: 10,
        cost: 0.001,
        durationMs: 500,
        success: true,
      });

      expect(metric.query).toBe('[REDACTED]');
      expect(metric.queryHash).toBeTruthy();
    });

    it('should respect maxHistory limit', () => {
      metricsCollector.configure({ enabled: true, maxHistory: 5 });
      
      for (let i = 0; i < 10; i++) {
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

      const { queries, total } = metricsCollector.getQueries();
      expect(queries.length).toBe(5);
      expect(total).toBe(5);
    });

    it('should store newest queries first', () => {
      metricsCollector.record({
        query: 'First query',
        contextBytes: 100,
        model: 'gpt-4',
        iterations: 1,
        tokensIn: 50,
        tokensOut: 10,
        cost: 0.001,
        durationMs: 500,
        success: true,
      });

      metricsCollector.record({
        query: 'Second query',
        contextBytes: 100,
        model: 'gpt-4',
        iterations: 1,
        tokensIn: 50,
        tokensOut: 10,
        cost: 0.001,
        durationMs: 500,
        success: true,
      });

      const { queries } = metricsCollector.getQueries();
      expect(queries[0].query).toBe('Second query');
      expect(queries[1].query).toBe('First query');
    });
  });

  describe('getQueries', () => {
    beforeEach(() => {
      // Add some test data
      for (let i = 0; i < 20; i++) {
        metricsCollector.record({
          query: `Query ${i}`,
          contextBytes: 100,
          model: i % 2 === 0 ? 'gpt-4' : 'claude-3',
          iterations: 1,
          tokensIn: 50,
          tokensOut: 10,
          cost: 0.001,
          durationMs: 500,
          success: i % 3 !== 0, // Every 3rd query fails
        });
      }
    });

    it('should return all queries with default options', () => {
      const { queries, total } = metricsCollector.getQueries();
      expect(queries.length).toBe(20);
      expect(total).toBe(20);
    });

    it('should support pagination with limit and offset', () => {
      const { queries, total } = metricsCollector.getQueries({ limit: 5, offset: 10 });
      expect(queries.length).toBe(5);
      expect(total).toBe(20);
    });

    it('should filter by model', () => {
      const { queries, total } = metricsCollector.getQueries({ model: 'gpt-4' });
      expect(queries.every(q => q.model === 'gpt-4')).toBe(true);
      expect(total).toBe(10);
    });

    it('should filter by success status', () => {
      const { queries: successQueries } = metricsCollector.getQueries({ success: true });
      const { queries: failedQueries } = metricsCollector.getQueries({ success: false });
      
      expect(successQueries.every(q => q.success === true)).toBe(true);
      expect(failedQueries.every(q => q.success === false)).toBe(true);
    });
  });

  describe('getQuery', () => {
    it('should return a single query by ID', () => {
      const recorded = metricsCollector.record({
        query: 'Test query',
        contextBytes: 100,
        model: 'gpt-4',
        iterations: 1,
        tokensIn: 50,
        tokensOut: 10,
        cost: 0.001,
        durationMs: 500,
        success: true,
      });

      const found = metricsCollector.getQuery(recorded.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(recorded.id);
      expect(found?.query).toBe('Test query');
    });

    it('should return undefined for non-existent ID', () => {
      const found = metricsCollector.getQuery('non-existent-id');
      expect(found).toBeUndefined();
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      // Add queries with different costs and models
      const models = ['gpt-4', 'claude-3', 'gemini'];
      for (let i = 0; i < 30; i++) {
        metricsCollector.record({
          query: `Query ${i}`,
          contextBytes: 100,
          model: models[i % 3],
          iterations: 1,
          tokensIn: 50,
          tokensOut: 10,
          cost: (i + 1) * 0.001, // Increasing cost
          durationMs: 500 + i * 100, // Increasing duration
          success: i % 5 !== 0, // 20% failure rate
        });
      }
    });

    it('should calculate total queries', () => {
      const stats = metricsCollector.getStats('day');
      expect(stats.queries).toBe(30);
    });

    it('should calculate total cost', () => {
      const stats = metricsCollector.getStats('day');
      // Sum of 1 to 30 * 0.001 = 0.465
      expect(stats.cost).toBeCloseTo(0.465, 3);
    });

    it('should calculate average duration', () => {
      const stats = metricsCollector.getStats('day');
      expect(stats.avgDuration).toBeGreaterThan(0);
    });

    it('should calculate error rate', () => {
      const stats = metricsCollector.getStats('day');
      // 6 failures out of 30 = 0.2
      expect(stats.errorRate).toBeCloseTo(0.2, 1);
    });

    it('should break down by model', () => {
      const stats = metricsCollector.getStats('day');
      expect(Object.keys(stats.byModel)).toHaveLength(3);
      expect(stats.byModel['gpt-4']).toBeDefined();
      expect(stats.byModel['gpt-4'].queries).toBe(10);
    });
  });

  describe('getHealth', () => {
    it('should return healthy status with low error rate', () => {
      for (let i = 0; i < 10; i++) {
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

      const health = metricsCollector.getHealth();
      expect(health.status).toBe('healthy');
      expect(health.totalQueries).toBe(10);
    });

    it('should return degraded status with moderate error rate', () => {
      for (let i = 0; i < 10; i++) {
        metricsCollector.record({
          query: `Query ${i}`,
          contextBytes: 100,
          model: 'gpt-4',
          iterations: 1,
          tokensIn: 50,
          tokensOut: 10,
          cost: 0.001,
          durationMs: 500,
          success: i < 8, // 20% error rate
        });
      }

      const health = metricsCollector.getHealth();
      expect(health.status).toBe('degraded');
    });

    it('should return unhealthy status with high error rate', () => {
      for (let i = 0; i < 10; i++) {
        metricsCollector.record({
          query: `Query ${i}`,
          contextBytes: 100,
          model: 'gpt-4',
          iterations: 1,
          tokensIn: 50,
          tokensOut: 10,
          cost: 0.001,
          durationMs: 500,
          success: i < 4, // 60% error rate
        });
      }

      const health = metricsCollector.getHealth();
      expect(health.status).toBe('unhealthy');
    });

    it('should track uptime', () => {
      const health = metricsCollector.getHealth();
      expect(health.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return last query timestamp', () => {
      metricsCollector.record({
        query: 'Test',
        contextBytes: 100,
        model: 'gpt-4',
        iterations: 1,
        tokensIn: 50,
        tokensOut: 10,
        cost: 0.001,
        durationMs: 500,
        success: true,
      });

      const health = metricsCollector.getHealth();
      expect(health.lastQuery).toBeInstanceOf(Date);
    });
  });

  describe('clear', () => {
    it('should remove all queries', () => {
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

      expect(metricsCollector.getQueries().total).toBe(5);
      
      metricsCollector.clear();
      
      expect(metricsCollector.getQueries().total).toBe(0);
    });
  });
});
