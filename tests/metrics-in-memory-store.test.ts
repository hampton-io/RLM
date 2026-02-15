import { InMemoryStore } from '../src/metrics/stores/in-memory-store.js';
import { runStoreContractTests } from './metrics-store-contract.js';

runStoreContractTests('InMemoryStore', async () => new InMemoryStore());
