/**
 * Caching layer for RLM responses.
 *
 * Provides in-memory and pluggable caching for repeated queries
 * to avoid redundant LLM calls.
 */

import { createHash } from 'node:crypto';
import type { RLMResult } from './types.js';

/**
 * Cache entry with metadata.
 */
export interface CacheEntry<T> {
  /** The cached value */
  value: T;
  /** When the entry was created */
  createdAt: number;
  /** When the entry expires (0 = never) */
  expiresAt: number;
  /** Number of times this entry has been accessed */
  hits: number;
  /** Size estimate in bytes */
  size: number;
}

/**
 * Cache statistics.
 */
export interface CacheStats {
  /** Total number of entries */
  entries: number;
  /** Total cache hits */
  hits: number;
  /** Total cache misses */
  misses: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Estimated total size in bytes */
  totalSize: number;
  /** Oldest entry age in ms */
  oldestEntryAge: number;
}

/**
 * Options for the cache.
 */
export interface CacheOptions {
  /** Maximum number of entries (default: 1000) */
  maxEntries?: number;
  /** Maximum total size in bytes (default: 50MB) */
  maxSize?: number;
  /** Default TTL in milliseconds (default: 1 hour, 0 = no expiration) */
  defaultTTL?: number;
  /** Whether to include context in cache key (default: true) */
  includeContext?: boolean;
  /** Whether to include model in cache key (default: true) */
  includeModel?: boolean;
  /** Custom key generator function */
  keyGenerator?: (query: string, context: string, model: string) => string;
}

/**
 * Cache interface for pluggable backends.
 */
export interface CacheBackend<T> {
  get(key: string): Promise<CacheEntry<T> | undefined>;
  set(key: string, entry: CacheEntry<T>): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
  size(): Promise<number>;
}

/**
 * In-memory cache backend using Map.
 */
export class MemoryCacheBackend<T> implements CacheBackend<T> {
  private cache = new Map<string, CacheEntry<T>>();

  async get(key: string): Promise<CacheEntry<T> | undefined> {
    return this.cache.get(key);
  }

  async set(key: string, entry: CacheEntry<T>): Promise<void> {
    this.cache.set(key, entry);
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async keys(): Promise<string[]> {
    return Array.from(this.cache.keys());
  }

  async size(): Promise<number> {
    return this.cache.size;
  }
}

/**
 * LRU (Least Recently Used) cache for RLM results.
 *
 * Features:
 * - Automatic eviction based on size and entry count
 * - TTL-based expiration
 * - Cache key generation from query + context hash
 * - Pluggable backends (memory, Redis, etc.)
 *
 * @example
 * ```typescript
 * const cache = new RLMCache({ maxEntries: 100 });
 *
 * // Check cache before calling RLM
 * const cached = await cache.get(query, context, model);
 * if (cached) {
 *   return cached;
 * }
 *
 * // Execute and cache result
 * const result = await rlm.completion(query, context);
 * await cache.set(query, context, model, result);
 * ```
 */
export class RLMCache {
  private backend: CacheBackend<RLMResult>;
  private options: Required<CacheOptions>;
  private stats = { hits: 0, misses: 0 };

  constructor(options: CacheOptions = {}, backend?: CacheBackend<RLMResult>) {
    this.options = {
      maxEntries: options.maxEntries ?? 1000,
      maxSize: options.maxSize ?? 50 * 1024 * 1024, // 50MB
      defaultTTL: options.defaultTTL ?? 60 * 60 * 1000, // 1 hour
      includeContext: options.includeContext ?? true,
      includeModel: options.includeModel ?? true,
      keyGenerator: options.keyGenerator ?? this.defaultKeyGenerator.bind(this),
    };
    this.backend = backend ?? new MemoryCacheBackend<RLMResult>();
  }

  /**
   * Generate a cache key from query, context, and model.
   */
  private defaultKeyGenerator(query: string, context: string, model: string): string {
    const parts = [query];

    if (this.options.includeContext) {
      // Hash the context to keep keys manageable
      const contextHash = createHash('sha256').update(context).digest('hex').slice(0, 16);
      parts.push(contextHash);
    }

    if (this.options.includeModel) {
      parts.push(model);
    }

    return createHash('sha256').update(parts.join('|')).digest('hex');
  }

  /**
   * Estimate the size of a result in bytes.
   */
  private estimateSize(result: RLMResult): number {
    // Rough estimate: JSON stringify length * 2 (for UTF-16)
    return JSON.stringify(result).length * 2;
  }

  /**
   * Get a cached result.
   *
   * @param query - The query string
   * @param context - The context string
   * @param model - The model name
   * @returns The cached result or undefined
   */
  async get(query: string, context: string, model: string): Promise<RLMResult | undefined> {
    const key = this.options.keyGenerator(query, context, model);
    const entry = await this.backend.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check expiration
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      await this.backend.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // Update hit count
    entry.hits++;
    await this.backend.set(key, entry);

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Cache a result.
   *
   * @param query - The query string
   * @param context - The context string
   * @param model - The model name
   * @param result - The result to cache
   * @param ttl - Optional TTL in milliseconds (overrides default)
   */
  async set(
    query: string,
    context: string,
    model: string,
    result: RLMResult,
    ttl?: number
  ): Promise<void> {
    const key = this.options.keyGenerator(query, context, model);
    const size = this.estimateSize(result);
    const effectiveTTL = ttl ?? this.options.defaultTTL;

    const entry: CacheEntry<RLMResult> = {
      value: result,
      createdAt: Date.now(),
      expiresAt: effectiveTTL > 0 ? Date.now() + effectiveTTL : 0,
      hits: 0,
      size,
    };

    // Evict if necessary
    await this.evictIfNecessary(size);

    await this.backend.set(key, entry);
  }

  /**
   * Evict entries if cache is over limits.
   */
  private async evictIfNecessary(incomingSize: number): Promise<void> {
    const keys = await this.backend.keys();

    // Check entry count
    if (keys.length >= this.options.maxEntries) {
      await this.evictOldest(Math.ceil(this.options.maxEntries * 0.1)); // Evict 10%
    }

    // Check total size
    let totalSize = 0;
    for (const key of keys) {
      const entry = await this.backend.get(key);
      if (entry) totalSize += entry.size;
    }

    if (totalSize + incomingSize > this.options.maxSize) {
      // Evict until we have space
      const targetSize = this.options.maxSize * 0.8; // Target 80% capacity
      await this.evictUntilSize(targetSize);
    }
  }

  /**
   * Evict the oldest N entries.
   */
  private async evictOldest(count: number): Promise<void> {
    const keys = await this.backend.keys();
    const entries: Array<{ key: string; createdAt: number }> = [];

    for (const key of keys) {
      const entry = await this.backend.get(key);
      if (entry) {
        entries.push({ key, createdAt: entry.createdAt });
      }
    }

    // Sort by creation time (oldest first)
    entries.sort((a, b) => a.createdAt - b.createdAt);

    // Delete oldest entries
    for (let i = 0; i < Math.min(count, entries.length); i++) {
      await this.backend.delete(entries[i].key);
    }
  }

  /**
   * Evict entries until total size is under target.
   */
  private async evictUntilSize(targetSize: number): Promise<void> {
    const keys = await this.backend.keys();
    const entries: Array<{ key: string; createdAt: number; size: number }> = [];

    let totalSize = 0;
    for (const key of keys) {
      const entry = await this.backend.get(key);
      if (entry) {
        entries.push({ key, createdAt: entry.createdAt, size: entry.size });
        totalSize += entry.size;
      }
    }

    if (totalSize <= targetSize) return;

    // Sort by creation time (oldest first)
    entries.sort((a, b) => a.createdAt - b.createdAt);

    // Delete until under target
    for (const entry of entries) {
      if (totalSize <= targetSize) break;
      await this.backend.delete(entry.key);
      totalSize -= entry.size;
    }
  }

  /**
   * Invalidate a cached entry.
   */
  async invalidate(query: string, context: string, model: string): Promise<boolean> {
    const key = this.options.keyGenerator(query, context, model);
    return this.backend.delete(key);
  }

  /**
   * Clear all cached entries.
   */
  async clear(): Promise<void> {
    await this.backend.clear();
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * Get cache statistics.
   */
  async getStats(): Promise<CacheStats> {
    const keys = await this.backend.keys();
    let totalSize = 0;
    let oldestCreatedAt = Date.now();

    for (const key of keys) {
      const entry = await this.backend.get(key);
      if (entry) {
        totalSize += entry.size;
        if (entry.createdAt < oldestCreatedAt) {
          oldestCreatedAt = entry.createdAt;
        }
      }
    }

    const total = this.stats.hits + this.stats.misses;
    return {
      entries: keys.length,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      totalSize,
      oldestEntryAge: keys.length > 0 ? Date.now() - oldestCreatedAt : 0,
    };
  }

  /**
   * Prune expired entries.
   */
  async prune(): Promise<number> {
    const keys = await this.backend.keys();
    const now = Date.now();
    let pruned = 0;

    for (const key of keys) {
      const entry = await this.backend.get(key);
      if (entry && entry.expiresAt > 0 && now > entry.expiresAt) {
        await this.backend.delete(key);
        pruned++;
      }
    }

    return pruned;
  }
}

/**
 * Create a cached RLM wrapper.
 *
 * @example
 * ```typescript
 * import { RLM } from 'rlm';
 * import { withCache, RLMCache } from 'rlm';
 *
 * const rlm = new RLM({ model: 'gpt-4o-mini' });
 * const cache = new RLMCache({ maxEntries: 100 });
 * const cachedRLM = withCache(rlm, cache);
 *
 * // First call hits the LLM
 * const result1 = await cachedRLM.completion(query, context);
 *
 * // Second identical call uses cache
 * const result2 = await cachedRLM.completion(query, context);
 * ```
 */
export function withCache(
  rlm: { completion: (query: string, context?: string) => Promise<RLMResult>; model: string },
  cache: RLMCache
): {
  completion: (query: string, context?: string) => Promise<RLMResult>;
  cache: RLMCache;
} {
  return {
    async completion(query: string, context?: string): Promise<RLMResult> {
      const ctx = context ?? '';

      // Try cache first
      const cached = await cache.get(query, ctx, rlm.model);
      if (cached) {
        return {
          ...cached,
          // Mark as cached in trace
          trace: cached.trace.map((t) => ({ ...t, cached: true })),
        };
      }

      // Execute and cache
      const result = await rlm.completion(query, context);
      await cache.set(query, ctx, rlm.model, result);

      return result;
    },
    cache,
  };
}

/**
 * Simple hash function for cache keys.
 */
export function hashString(str: string): string {
  return createHash('sha256').update(str).digest('hex');
}
