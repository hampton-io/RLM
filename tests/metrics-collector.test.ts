import { describe, it, expect, beforeEach } from 'vitest';
import { metricsCollector } from '../src/metrics/collector.js';
import { InMemoryStore } from '../src/metrics/stores/in-memory-store.js';

describe('MetricsCollector', () => {
  beforeEach(async () => {
    await metricsCollector.configure({
      enabled: true,
      maxHistory: 100,
    });
    await metricsCollector.clear();
  });

  describe('configuration', () => {
    it('should be disabled by default', async () => {
      await metricsCollector.configure({ enabled: false });
      expect(metricsCollector.isEnabled()).toBe(false);
    });

    it('should enable when configured', async () => {
      await metricsCollector.configure({ enabled: true });
      expect(metricsCollector.isEnabled()).toBe(true);
    });

    it('should store API key', async () => {
      await metricsCollector.configure({ enabled: true, apiKey: 'test-key' });
      expect(metricsCollector.getApiKey()).toBe('test-key');
    });

    it('should accept an injected store', async () => {
      const customStore = new InMemoryStore();
      await metricsCollector.configure({ enabled: true, store: customStore });
      expect(metricsCollector.getStore()).toBe(customStore);
    });
  });

  describe('record', () => {
    it('should record a query metric', async () => {
      const metric = await metricsCollector.record({
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

    it('should not record when disabled', async () => {
      await metricsCollector.configure({ enabled: false });

      await metricsCollector.record({
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

      const { queries } = await metricsCollector.getQueries();
      expect(queries.length).toBe(0);
    });

    it('should redact query text when configured', async () => {
      await metricsCollector.configure({ enabled: true, redactQueries: true });

      const metric = await metricsCollector.record({
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

    it('should respect maxHistory limit', async () => {
      await metricsCollector.configure({ enabled: true, maxHistory: 5 });

      for (let i = 0; i < 10; i++) {
        await metricsCollector.record({
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

      const { queries, total } = await metricsCollector.getQueries();
      expect(queries.length).toBe(5);
      expect(total).toBe(5);
    });

    it('should store newest queries first', async () => {
      await metricsCollector.record({
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

      await metricsCollector.record({
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

      const { queries } = await metricsCollector.getQueries();
      expect(queries[0].query).toBe('Second query');
      expect(queries[1].query).toBe('First query');
    });

    it('should support tags and instanceId fields', async () => {
      const metric = await metricsCollector.record({
        query: 'Tagged query',
        contextBytes: 100,
        model: 'gpt-4',
        iterations: 1,
        tokensIn: 50,
        tokensOut: 10,
        cost: 0.001,
        durationMs: 500,
        success: true,
        tags: ['batch', 'production'],
        instanceId: 'inst-1',
      });

      expect(metric.tags).toEqual(['batch', 'production']);
      expect(metric.instanceId).toBe('inst-1');
    });
  });

  describe('getQueries', () => {
    beforeEach(async () => {
      for (let i = 0; i < 20; i++) {
        await metricsCollector.record({
          query: `Query ${i}`,
          contextBytes: 100,
          model: i % 2 === 0 ? 'gpt-4' : 'claude-3',
          iterations: 1,
          tokensIn: 50,
          tokensOut: 10,
          cost: 0.001,
          durationMs: 500,
          success: i % 3 !== 0,
        });
      }
    });

    it('should return all queries with default options', async () => {
      const { queries, total } = await metricsCollector.getQueries();
      expect(queries.length).toBe(20);
      expect(total).toBe(20);
    });

    it('should support pagination with limit and offset', async () => {
      const { queries, total } = await metricsCollector.getQueries({ limit: 5, offset: 10 });
      expect(queries.length).toBe(5);
      expect(total).toBe(20);
    });

    it('should filter by model', async () => {
      const { queries, total } = await metricsCollector.getQueries({ model: 'gpt-4' });
      expect(queries.every((q) => q.model === 'gpt-4')).toBe(true);
      expect(total).toBe(10);
    });

    it('should filter by success status', async () => {
      const { queries: successQueries } = await metricsCollector.getQueries({ success: true });
      const { queries: failedQueries } = await metricsCollector.getQueries({ success: false });

      expect(successQueries.every((q) => q.success === true)).toBe(true);
      expect(failedQueries.every((q) => q.success === false)).toBe(true);
    });
  });

  describe('getQuery', () => {
    it('should return a single query by ID', async () => {
      const recorded = await metricsCollector.record({
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

      const found = await metricsCollector.getQuery(recorded.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(recorded.id);
      expect(found?.query).toBe('Test query');
    });

    it('should return undefined for non-existent ID', async () => {
      const found = await metricsCollector.getQuery('non-existent-id');
      expect(found).toBeUndefined();
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      const models = ['gpt-4', 'claude-3', 'gemini'];
      for (let i = 0; i < 30; i++) {
        await metricsCollector.record({
          query: `Query ${i}`,
          contextBytes: 100,
          model: models[i % 3],
          iterations: 1,
          tokensIn: 50,
          tokensOut: 10,
          cost: (i + 1) * 0.001,
          durationMs: 500 + i * 100,
          success: i % 5 !== 0,
        });
      }
    });

    it('should calculate total queries', async () => {
      const stats = await metricsCollector.getStats('day');
      expect(stats.queries).toBe(30);
    });

    it('should calculate total cost', async () => {
      const stats = await metricsCollector.getStats('day');
      expect(stats.cost).toBeCloseTo(0.465, 3);
    });

    it('should calculate average duration', async () => {
      const stats = await metricsCollector.getStats('day');
      expect(stats.avgDuration).toBeGreaterThan(0);
    });

    it('should calculate error rate', async () => {
      const stats = await metricsCollector.getStats('day');
      expect(stats.errorRate).toBeCloseTo(0.2, 1);
    });

    it('should break down by model', async () => {
      const stats = await metricsCollector.getStats('day');
      expect(Object.keys(stats.byModel)).toHaveLength(3);
      expect(stats.byModel['gpt-4']).toBeDefined();
      expect(stats.byModel['gpt-4'].queries).toBe(10);
    });
  });

  describe('getHealth', () => {
    it('should return healthy status with low error rate', async () => {
      for (let i = 0; i < 10; i++) {
        await metricsCollector.record({
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

      const health = await metricsCollector.getHealth();
      expect(health.status).toBe('healthy');
      expect(health.totalQueries).toBe(10);
    });

    it('should return degraded status with moderate error rate', async () => {
      for (let i = 0; i < 10; i++) {
        await metricsCollector.record({
          query: `Query ${i}`,
          contextBytes: 100,
          model: 'gpt-4',
          iterations: 1,
          tokensIn: 50,
          tokensOut: 10,
          cost: 0.001,
          durationMs: 500,
          success: i < 8,
        });
      }

      const health = await metricsCollector.getHealth();
      expect(health.status).toBe('degraded');
    });

    it('should return unhealthy status with high error rate', async () => {
      for (let i = 0; i < 10; i++) {
        await metricsCollector.record({
          query: `Query ${i}`,
          contextBytes: 100,
          model: 'gpt-4',
          iterations: 1,
          tokensIn: 50,
          tokensOut: 10,
          cost: 0.001,
          durationMs: 500,
          success: i < 4,
        });
      }

      const health = await metricsCollector.getHealth();
      expect(health.status).toBe('unhealthy');
    });

    it('should track uptime', async () => {
      const health = await metricsCollector.getHealth();
      expect(health.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return last query timestamp', async () => {
      await metricsCollector.record({
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

      const health = await metricsCollector.getHealth();
      expect(health.lastQuery).toBeInstanceOf(Date);
    });
  });

  describe('clear', () => {
    it('should remove all queries', async () => {
      for (let i = 0; i < 5; i++) {
        await metricsCollector.record({
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

      const before = await metricsCollector.getQueries();
      expect(before.total).toBe(5);

      await metricsCollector.clear();

      const after = await metricsCollector.getQueries();
      expect(after.total).toBe(0);
    });
  });

  describe('export', () => {
    it('should return all metrics', async () => {
      for (let i = 0; i < 3; i++) {
        await metricsCollector.record({
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

      const exported = await metricsCollector.export();
      expect(exported.length).toBe(3);
    });
  });
});
