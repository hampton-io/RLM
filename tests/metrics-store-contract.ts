import { describe, it, expect, beforeEach } from 'vitest';
import type { MetricsStore } from '../src/metrics/types.js';
import type { QueryMetric } from '../src/metrics/collector.js';

function createTestMetric(overrides: Partial<QueryMetric> = {}): QueryMetric {
  return {
    id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    timestamp: new Date(),
    query: 'What is the meaning of life?',
    contextBytes: 1000,
    model: 'gpt-4',
    iterations: 3,
    tokensIn: 500,
    tokensOut: 100,
    cost: 0.01,
    durationMs: 2000,
    success: true,
    ...overrides,
  };
}

export function runStoreContractTests(
  name: string,
  createStore: () => Promise<MetricsStore>
): void {
  describe(`MetricsStore contract: ${name}`, () => {
    let store: MetricsStore;

    beforeEach(async () => {
      store = await createStore();
      await store.connect();
      await store.clear();
    });

    describe('record and retrieve', () => {
      it('should record and retrieve a metric by id', async () => {
        const metric = createTestMetric();
        await store.record(metric);

        const found = await store.getById(metric.id);
        expect(found).toBeDefined();
        expect(found!.id).toBe(metric.id);
        expect(found!.query).toBe(metric.query);
        expect(found!.model).toBe(metric.model);
        expect(found!.cost).toBe(metric.cost);
        expect(found!.success).toBe(true);
      });

      it('should return undefined for non-existent id', async () => {
        const found = await store.getById('non-existent');
        expect(found).toBeUndefined();
      });

      it('should store tags and instanceId', async () => {
        const metric = createTestMetric({
          tags: ['production', 'batch'],
          instanceId: 'inst-1',
        });
        await store.record(metric);

        const found = await store.getById(metric.id);
        expect(found!.tags).toEqual(['production', 'batch']);
        expect(found!.instanceId).toBe('inst-1');
      });
    });

    describe('query with filters', () => {
      beforeEach(async () => {
        const now = Date.now();
        for (let i = 0; i < 20; i++) {
          await store.record(
            createTestMetric({
              id: `q_${i}`,
              timestamp: new Date(now - i * 60000),
              model: i % 2 === 0 ? 'gpt-4' : 'claude-3',
              success: i % 3 !== 0,
              cost: (i + 1) * 0.001,
              durationMs: 500 + i * 100,
              query: `Query ${i}`,
              instanceId: i < 10 ? 'inst-a' : 'inst-b',
            })
          );
        }
      });

      it('should return all metrics with empty filter', async () => {
        const result = await store.query({});
        expect(result.total).toBe(20);
      });

      it('should filter by model', async () => {
        const result = await store.query({ model: 'gpt-4' });
        expect(result.metrics.every((m) => m.model === 'gpt-4')).toBe(true);
        expect(result.total).toBe(10);
      });

      it('should filter by success', async () => {
        const success = await store.query({ success: true });
        expect(success.metrics.every((m) => m.success)).toBe(true);

        const failed = await store.query({ success: false });
        expect(failed.metrics.every((m) => !m.success)).toBe(true);
      });

      it('should paginate with limit and offset', async () => {
        const page1 = await store.query({ limit: 5, offset: 0 });
        expect(page1.metrics.length).toBe(5);
        expect(page1.total).toBe(20);

        const page2 = await store.query({ limit: 5, offset: 5 });
        expect(page2.metrics.length).toBe(5);

        const ids1 = page1.metrics.map((m) => m.id);
        const ids2 = page2.metrics.map((m) => m.id);
        expect(ids1).not.toEqual(ids2);
      });

      it('should filter by minCost and maxCost', async () => {
        const result = await store.query({ minCost: 0.005, maxCost: 0.015 });
        expect(result.metrics.every((m) => m.cost >= 0.005 && m.cost <= 0.015)).toBe(true);
      });

      it('should filter by instanceId', async () => {
        const result = await store.query({ instanceId: 'inst-a' });
        expect(result.total).toBe(10);
        expect(result.metrics.every((m) => m.instanceId === 'inst-a')).toBe(true);
      });

      it('should filter by queryContains', async () => {
        const result = await store.query({ queryContains: 'Query 1' });
        expect(result.total).toBeGreaterThan(0);
        expect(
          result.metrics.every((m) => m.query.toLowerCase().includes('query 1'))
        ).toBe(true);
      });

      it('should sort by cost ascending', async () => {
        const result = await store.query({
          orderBy: 'cost',
          orderDirection: 'asc',
          limit: 20,
        });
        for (let i = 1; i < result.metrics.length; i++) {
          expect(result.metrics[i].cost).toBeGreaterThanOrEqual(result.metrics[i - 1].cost);
        }
      });

      it('should sort by duration descending', async () => {
        const result = await store.query({
          orderBy: 'duration',
          orderDirection: 'desc',
          limit: 20,
        });
        for (let i = 1; i < result.metrics.length; i++) {
          expect(result.metrics[i].durationMs).toBeLessThanOrEqual(
            result.metrics[i - 1].durationMs
          );
        }
      });
    });

    describe('getStats', () => {
      beforeEach(async () => {
        for (let i = 0; i < 10; i++) {
          await store.record(
            createTestMetric({
              id: `q_stats_${i}`,
              model: i % 2 === 0 ? 'gpt-4' : 'claude-3',
              cost: 0.01,
              durationMs: 1000,
              success: i !== 5,
            })
          );
        }
      });

      it('should calculate stats for period', async () => {
        const dayMs = 24 * 60 * 60 * 1000;
        const stats = await store.getStats(dayMs);

        expect(stats.queries).toBe(10);
        expect(stats.cost).toBeCloseTo(0.1, 5);
        expect(stats.avgDuration).toBe(1000);
        expect(stats.errorRate).toBeCloseTo(0.1, 5);
      });

      it('should break down by model', async () => {
        const dayMs = 24 * 60 * 60 * 1000;
        const stats = await store.getStats(dayMs);

        expect(Object.keys(stats.byModel)).toHaveLength(2);
        expect(stats.byModel['gpt-4'].queries).toBe(5);
        expect(stats.byModel['claude-3'].queries).toBe(5);
      });
    });

    describe('prune', () => {
      it('should prune by maxQueries', async () => {
        for (let i = 0; i < 20; i++) {
          await store.record(
            createTestMetric({
              id: `q_prune_${i}`,
              timestamp: new Date(Date.now() - i * 1000),
            })
          );
        }

        const pruned = await store.prune({ maxQueries: 10 });
        expect(pruned).toBe(10);

        const remaining = await store.query({});
        expect(remaining.total).toBe(10);
      });

      it('should prune by retentionDays', async () => {
        const now = Date.now();
        for (let i = 0; i < 10; i++) {
          await store.record(
            createTestMetric({
              id: `q_ret_${i}`,
              timestamp: new Date(now - i * 24 * 60 * 60 * 1000),
            })
          );
        }

        const pruned = await store.prune({ retentionDays: 5 });
        expect(pruned).toBeGreaterThan(0);

        const remaining = await store.query({});
        const cutoff = new Date(now - 5 * 24 * 60 * 60 * 1000);
        expect(remaining.metrics.every((m) => m.timestamp >= cutoff)).toBe(true);
      });
    });

    describe('clear', () => {
      it('should remove all metrics', async () => {
        for (let i = 0; i < 5; i++) {
          await store.record(createTestMetric({ id: `q_clear_${i}` }));
        }

        const before = await store.query({});
        expect(before.total).toBe(5);

        await store.clear();

        const after = await store.query({});
        expect(after.total).toBe(0);
      });
    });

    describe('export', () => {
      it('should return all metrics', async () => {
        for (let i = 0; i < 5; i++) {
          await store.record(createTestMetric({ id: `q_export_${i}` }));
        }

        const exported = await store.export();
        expect(exported.length).toBe(5);
      });
    });

    describe('healthCheck', () => {
      it('should report healthy status', async () => {
        const health = await store.healthCheck();
        expect(health.healthy).toBe(true);
        expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      });
    });
  });
}
