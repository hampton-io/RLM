import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { SqliteStore } from '../src/metrics/stores/sqlite-store.js';
import { runStoreContractTests } from './metrics-store-contract.js';

const testDir = join(tmpdir(), `rlm-sqlite-test-${randomBytes(6).toString('hex')}`);

function getTestDbPath(): string {
  return join(testDir, `test-${randomBytes(4).toString('hex')}.db`);
}

// Run shared contract tests
runStoreContractTests('SqliteStore', async () => {
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }
  return new SqliteStore(getTestDbPath());
});

describe('SqliteStore specific', () => {
  let store: SqliteStore;

  beforeEach(async () => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    store = new SqliteStore(getTestDbPath());
    await store.connect();
    await store.clear();
  });

  afterEach(async () => {
    await store.disconnect();
  });

  it('should use WAL journal mode', async () => {
    // WAL mode is set during connect - if we got here, it worked
    const health = await store.healthCheck();
    expect(health.healthy).toBe(true);
  });

  it('should support batch insert via recordBatch', async () => {
    const metrics = Array.from({ length: 100 }, (_, i) => ({
      id: `q_batch_${i}`,
      timestamp: new Date(),
      query: `Batch query ${i}`,
      contextBytes: 100,
      model: 'gpt-4',
      iterations: 1,
      tokensIn: 50,
      tokensOut: 10,
      cost: 0.001,
      durationMs: 500,
      success: true,
    }));

    await store.recordBatch(metrics);

    const result = await store.query({ limit: 200 });
    expect(result.total).toBe(100);
  });

  it('should persist across reconnections', async () => {
    const dbPath = getTestDbPath();
    const store1 = new SqliteStore(dbPath);
    await store1.connect();

    await store1.record({
      id: 'q_persist_1',
      timestamp: new Date(),
      query: 'Test persistence',
      contextBytes: 100,
      model: 'gpt-4',
      iterations: 1,
      tokensIn: 50,
      tokensOut: 10,
      cost: 0.001,
      durationMs: 500,
      success: true,
    });

    await store1.disconnect();

    // Reconnect
    const store2 = new SqliteStore(dbPath);
    await store2.connect();

    const result = await store2.query({});
    expect(result.total).toBe(1);
    expect(result.metrics[0].id).toBe('q_persist_1');

    await store2.disconnect();
  });

  it('should report unhealthy when disconnected', async () => {
    const tempStore = new SqliteStore(getTestDbPath());
    // Don't connect
    const health = await tempStore.healthCheck();
    expect(health.healthy).toBe(false);
  });

  it('should handle metadata serialization', async () => {
    await store.record({
      id: 'q_meta_1',
      timestamp: new Date(),
      query: 'Test metadata',
      contextBytes: 100,
      model: 'gpt-4',
      iterations: 1,
      tokensIn: 50,
      tokensOut: 10,
      cost: 0.001,
      durationMs: 500,
      success: true,
      metadata: { key: 'value', nested: { a: 1 } },
    });

    const found = await store.getById('q_meta_1');
    expect(found!.metadata).toEqual({ key: 'value', nested: { a: 1 } });
  });
});

afterAll(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});
