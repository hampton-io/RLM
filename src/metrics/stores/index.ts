import type { MetricsStore } from '../types.js';
import { InMemoryStore } from './in-memory-store.js';
import { JsonFileStore } from './json-file-store.js';

export { InMemoryStore } from './in-memory-store.js';
export { JsonFileStore } from './json-file-store.js';

export interface MetricsStoreConfig {
  store?: MetricsStore;
  storagePath?: string;
  type?: 'memory' | 'json' | 'sqlite';
  sqlitePath?: string;
}

export async function createMetricsStore(config: MetricsStoreConfig): Promise<MetricsStore> {
  // If a store instance is provided directly, use it
  if (config.store) {
    await config.store.connect();
    return config.store;
  }

  const type = config.type ?? (config.storagePath ? 'json' : 'memory');

  let store: MetricsStore;

  switch (type) {
    case 'json': {
      if (!config.storagePath) {
        throw new Error('storagePath is required for json metrics store');
      }
      store = new JsonFileStore(config.storagePath);
      break;
    }
    case 'sqlite': {
      const path = config.sqlitePath ?? config.storagePath;
      if (!path) {
        throw new Error('sqlitePath or storagePath is required for sqlite metrics store');
      }
      const { SqliteStore } = await import('./sqlite-store.js');
      store = new SqliteStore(path);
      break;
    }
    case 'memory':
    default:
      store = new InMemoryStore();
      break;
  }

  await store.connect();
  return store;
}
