/**
 * File Watcher for Real-time Index Updates
 *
 * Watches for file changes and triggers incremental index updates.
 */

import { watch, FSWatcher } from 'fs';
import * as path from 'path';
import {
  RLMServerConfig,
  DEFAULT_CONFIG,
  SupportedLanguage,
} from '../types.js';
import { PatternMatcher, loadGitignore, isSupportedFile } from '../utils/index.js';
import { CodebaseIndexer } from '../indexer/indexer.js';

/**
 * File change event
 */
export interface FileChangeEvent {
  type: 'add' | 'change' | 'delete';
  path: string;
  relativePath: string;
  timestamp: number;
}

/**
 * File change handler
 */
export type FileChangeHandler = (event: FileChangeEvent) => void;

/**
 * Watcher options
 */
export interface WatcherOptions {
  debounceMs?: number;
  ignoreInitial?: boolean;
  persistent?: boolean;
}

/**
 * File Watcher
 */
export class FileWatcher {
  private config: RLMServerConfig;
  private watcher: FSWatcher | null = null;
  private handlers: FileChangeHandler[] = [];
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private gitignore: PatternMatcher | null = null;
  private running = false;
  private options: WatcherOptions;
  private indexer: CodebaseIndexer | null = null;

  constructor(config: Partial<RLMServerConfig> = {}, options: WatcherOptions = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.options = {
      debounceMs: 300,
      ignoreInitial: true,
      persistent: true,
      ...options,
    };
  }

  /**
   * Set indexer for automatic updates
   */
  setIndexer(indexer: CodebaseIndexer): void {
    this.indexer = indexer;
  }

  /**
   * Subscribe to file change events
   */
  onChange(handler: FileChangeHandler): () => void {
    this.handlers.push(handler);
    return () => {
      const index = this.handlers.indexOf(handler);
      if (index >= 0) {
        this.handlers.splice(index, 1);
      }
    };
  }

  /**
   * Emit a file change event
   */
  private emit(event: FileChangeEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }

    // Auto-update index if indexer is set
    if (this.indexer) {
      this.updateIndex(event);
    }
  }

  /**
   * Update index for file change
   */
  private async updateIndex(event: FileChangeEvent): Promise<void> {
    if (!this.indexer) return;

    try {
      await this.indexer.updateIndex([event.path]);
    } catch (error) {
      console.error(`Failed to update index for ${event.path}:`, error);
    }
  }

  /**
   * Start watching
   */
  async start(rootPath?: string): Promise<void> {
    if (this.running) {
      throw new Error('Watcher is already running');
    }

    const root = rootPath || this.config.rootPath;
    const absoluteRoot = path.resolve(root);

    // Load gitignore
    this.gitignore = await loadGitignore(absoluteRoot);

    // Add config ignore patterns
    const ignoreMatcher = new PatternMatcher(this.config.ignorePatterns || []);

    // Start recursive watcher
    this.watcher = watch(
      absoluteRoot,
      { recursive: true, persistent: this.options.persistent },
      (eventType, filename) => {
        if (!filename) return;

        const absolutePath = path.join(absoluteRoot, filename);
        const relativePath = filename.replace(/\\/g, '/');

        // Check if file should be ignored
        if (this.gitignore?.matches(relativePath)) return;
        if (ignoreMatcher.matches(relativePath)) return;

        // Check if supported file type
        if (!isSupportedFile(absolutePath)) return;

        // Debounce rapid changes
        this.debounceChange(absolutePath, relativePath, eventType);
      }
    );

    this.running = true;
    console.error(`File watcher started for: ${absoluteRoot}`);
  }

  /**
   * Debounce file change events
   */
  private debounceChange(
    absolutePath: string,
    relativePath: string,
    eventType: string
  ): void {
    // Clear existing timer
    const existingTimer = this.debounceTimers.get(absolutePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(async () => {
      this.debounceTimers.delete(absolutePath);

      // Determine event type
      let changeType: FileChangeEvent['type'];
      try {
        const fs = await import('fs/promises');
        await fs.access(absolutePath);
        changeType = eventType === 'rename' ? 'add' : 'change';
      } catch {
        changeType = 'delete';
      }

      this.emit({
        type: changeType,
        path: absolutePath,
        relativePath,
        timestamp: Date.now(),
      });
    }, this.options.debounceMs);

    this.debounceTimers.set(absolutePath, timer);
  }

  /**
   * Stop watching
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    this.running = false;
    console.error('File watcher stopped');
  }

  /**
   * Check if watcher is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get watcher statistics
   */
  getStats(): { running: boolean; pendingChanges: number } {
    return {
      running: this.running,
      pendingChanges: this.debounceTimers.size,
    };
  }
}

/**
 * Create file watcher instance
 */
export function createFileWatcher(
  config: Partial<RLMServerConfig> = {},
  options: WatcherOptions = {}
): FileWatcher {
  return new FileWatcher(config, options);
}
