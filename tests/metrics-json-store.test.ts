import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { JsonFileStore } from '../src/metrics/stores/json-file-store.js';
import { runStoreContractTests } from './metrics-store-contract.js';

const testDir = join(tmpdir(), `rlm-test-${randomBytes(6).toString('hex')}`);

function getTestPath(): string {
  return join(testDir, `metrics-${randomBytes(4).toString('hex')}.json`);
}

// Run shared contract tests
runStoreContractTests('JsonFileStore', async () => {
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }
  return new JsonFileStore(getTestPath());
});

describe('JsonFileStore specific', () => {
  let store: JsonFileStore;
  let filePath: string;

  beforeEach(async () => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    filePath = getTestPath();
    store = new JsonFileStore(filePath);
    await store.connect();
  });

  afterEach(async () => {
    await store.disconnect();
  });

  it('should create parent directories on connect', async () => {
    const deepPath = join(testDir, 'deep', 'nested', 'dir', 'metrics.json');
    const deepStore = new JsonFileStore(deepPath);
    await deepStore.connect();

    expect(existsSync(join(testDir, 'deep', 'nested', 'dir'))).toBe(true);
    await deepStore.disconnect();
  });

  it('should recover from corrupted file', async () => {
    writeFileSync(filePath, 'not valid json!!!');

    const freshStore = new JsonFileStore(filePath);
    await freshStore.connect();

    // Should start empty after corruption
    const result = await freshStore.query({});
    expect(result.total).toBe(0);
    await freshStore.disconnect();
  });

  it('should load existing metrics file', async () => {
    // Write some metrics in the old format
    const oldMetrics = [
      {
        id: 'q_old_1',
        timestamp: new Date().toISOString(),
        query: 'Old query',
        contextBytes: 100,
        model: 'gpt-4',
        iterations: 1,
        tokensIn: 50,
        tokensOut: 10,
        cost: 0.001,
        durationMs: 500,
        success: true,
      },
    ];
    writeFileSync(filePath, JSON.stringify(oldMetrics, null, 2));

    const loadStore = new JsonFileStore(filePath);
    await loadStore.connect();

    const result = await loadStore.query({});
    expect(result.total).toBe(1);
    expect(result.metrics[0].id).toBe('q_old_1');
    await loadStore.disconnect();
  });

  it('should persist metrics to file after record', async () => {
    await store.record({
      id: 'q_persist_1',
      timestamp: new Date(),
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

    // Verify file exists and has content
    expect(existsSync(filePath)).toBe(true);

    // Create a new store pointing to same file to verify persistence
    const store2 = new JsonFileStore(filePath);
    await store2.connect();

    const result = await store2.query({});
    expect(result.total).toBe(1);
    expect(result.metrics[0].id).toBe('q_persist_1');
    await store2.disconnect();
  });
});

// Cleanup
afterAll(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

import { afterAll } from 'vitest';
