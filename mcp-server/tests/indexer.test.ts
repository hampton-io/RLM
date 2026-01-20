/**
 * Codebase Indexer Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { CodebaseIndexer, createIndexer } from '../src/indexer/indexer.js';
import { RLMServerConfig } from '../src/types.js';

describe('CodebaseIndexer', () => {
  let tempDir: string;
  let indexer: CodebaseIndexer;

  beforeEach(async () => {
    // Create temp directory with test files
    tempDir = path.join(os.tmpdir(), `rlm-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Create test files
    await fs.writeFile(
      path.join(tempDir, 'test.ts'),
      `
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }
}

export interface Config {
  debug: boolean;
  timeout: number;
}
`
    );

    await fs.writeFile(
      path.join(tempDir, 'utils.ts'),
      `
import { greet } from './test';

export const helper = () => {
  return greet('World');
};
`
    );

    await fs.mkdir(path.join(tempDir, 'lib'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, 'lib', 'math.ts'),
      `
export function sum(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0);
}

export function average(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return sum(numbers) / numbers.length;
}
`
    );

    indexer = createIndexer({ rootPath: tempDir });
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Indexer Creation', () => {
    it('should create indexer with default config', () => {
      const idx = createIndexer();
      expect(idx).toBeInstanceOf(CodebaseIndexer);
    });

    it('should create indexer with custom config', () => {
      const config: Partial<RLMServerConfig> = {
        rootPath: '/custom/path',
        chunkSize: 1000,
      };
      const idx = createIndexer(config);
      expect(idx).toBeInstanceOf(CodebaseIndexer);
    });
  });

  describe('Codebase Indexing', () => {
    it('should index codebase', async () => {
      const index = await indexer.indexCodebase();

      expect(index).toBeDefined();
      expect(index.rootPath).toBe(tempDir);
      expect(index.files.size).toBe(3);
    });

    it('should extract symbols from files', async () => {
      const index = await indexer.indexCodebase();

      const testFile = index.files.get('test.ts');
      expect(testFile).toBeDefined();
      expect(testFile?.symbols.length).toBeGreaterThan(0);

      const symbolNames = testFile?.symbols.map((s) => s.name);
      expect(symbolNames).toContain('greet');
      expect(symbolNames).toContain('Calculator');
      expect(symbolNames).toContain('Config');
    });

    it('should create chunks for files', async () => {
      const index = await indexer.indexCodebase();

      expect(index.totalChunks).toBeGreaterThan(0);

      const testFile = index.files.get('test.ts');
      expect(testFile?.chunks.length).toBeGreaterThan(0);
    });

    it('should track language distribution', async () => {
      const index = await indexer.indexCodebase();

      expect(index.languages.typescript).toBe(3);
    });

    it('should emit events during indexing', async () => {
      const events: string[] = [];

      indexer.onEvent((event) => {
        events.push(event.type);
      });

      await indexer.indexCodebase();

      expect(events).toContain('started');
      expect(events).toContain('completed');
      expect(events).toContain('file_indexed');
    });
  });

  describe('Index Retrieval', () => {
    it('should return null before indexing', () => {
      const index = indexer.getIndex();
      expect(index).toBeNull();
    });

    it('should return index after indexing', async () => {
      await indexer.indexCodebase();
      const index = indexer.getIndex();
      expect(index).not.toBeNull();
    });
  });

  describe('Index Persistence', () => {
    it('should save and load index', async () => {
      const indexPath = path.join(tempDir, '.rlm-index');

      // Index and save
      await indexer.indexCodebase();
      await indexer.saveIndex(indexPath);

      // Create new indexer and load
      const newIndexer = createIndexer({ rootPath: tempDir });
      const loaded = await newIndexer.loadIndex(indexPath);

      expect(loaded).not.toBeNull();
      expect(loaded?.files.size).toBe(3);
    });

    it('should return null for non-existent index', async () => {
      const loaded = await indexer.loadIndex('/non/existent/path');
      expect(loaded).toBeNull();
    });
  });

  describe('Incremental Updates', () => {
    it('should update index when file changes', async () => {
      await indexer.indexCodebase();

      // Modify a file
      await fs.writeFile(
        path.join(tempDir, 'test.ts'),
        `
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export function farewell(name: string): string {
  return \`Goodbye, \${name}!\`;
}
`
      );

      await indexer.updateIndex([path.join(tempDir, 'test.ts')]);

      const index = indexer.getIndex();
      const testFile = index?.files.get('test.ts');
      const symbolNames = testFile?.symbols.map((s) => s.name);

      expect(symbolNames).toContain('farewell');
    });

    it('should remove file from index when deleted', async () => {
      await indexer.indexCodebase();

      // Delete a file
      await fs.rm(path.join(tempDir, 'utils.ts'));

      await indexer.updateIndex([path.join(tempDir, 'utils.ts')]);

      const index = indexer.getIndex();
      expect(index?.files.has('utils.ts')).toBe(false);
    });
  });
});

describe('Symbol Extraction', () => {
  let tempDir: string;
  let indexer: CodebaseIndexer;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `rlm-symbol-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    indexer = createIndexer({ rootPath: tempDir });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should extract function symbols', async () => {
    await fs.writeFile(
      path.join(tempDir, 'functions.ts'),
      `
function normalFunc() {}
async function asyncFunc() {}
export function exportedFunc() {}
const arrowFunc = () => {};
`
    );

    const index = await indexer.indexCodebase();
    const file = index.files.get('functions.ts');
    const symbolNames = file?.symbols.map((s) => s.name);

    expect(symbolNames).toContain('normalFunc');
    expect(symbolNames).toContain('asyncFunc');
    expect(symbolNames).toContain('exportedFunc');
    expect(symbolNames).toContain('arrowFunc');
  });

  it('should extract class symbols', async () => {
    await fs.writeFile(
      path.join(tempDir, 'classes.ts'),
      `
class BaseClass {}
abstract class AbstractClass {}
export class ExportedClass {}
`
    );

    const index = await indexer.indexCodebase();
    const file = index.files.get('classes.ts');
    const symbolNames = file?.symbols.map((s) => s.name);

    expect(symbolNames).toContain('BaseClass');
    expect(symbolNames).toContain('AbstractClass');
    expect(symbolNames).toContain('ExportedClass');
  });

  it('should extract interface and type symbols', async () => {
    await fs.writeFile(
      path.join(tempDir, 'types.ts'),
      `
interface MyInterface {}
type MyType = string;
export interface ExportedInterface {}
export type ExportedType = number;
`
    );

    const index = await indexer.indexCodebase();
    const file = index.files.get('types.ts');
    const symbolNames = file?.symbols.map((s) => s.name);

    expect(symbolNames).toContain('MyInterface');
    expect(symbolNames).toContain('MyType');
    expect(symbolNames).toContain('ExportedInterface');
    expect(symbolNames).toContain('ExportedType');
  });
});
