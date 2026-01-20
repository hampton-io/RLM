/**
 * Search Engine Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodeSearchEngine, createSearchEngine } from '../src/search/search.js';
import {
  CodebaseIndex,
  IndexedFile,
  IndexedChunk,
  SearchQuery,
  SupportedLanguage,
} from '../src/types.js';

describe('CodeSearchEngine', () => {
  let searchEngine: CodeSearchEngine;
  let mockIndex: CodebaseIndex;

  beforeEach(() => {
    searchEngine = createSearchEngine();

    // Create mock index
    const mockChunks: IndexedChunk[] = [
      {
        id: 'auth.ts:authenticate:1',
        filePath: 'auth.ts',
        startLine: 1,
        endLine: 15,
        content: `
export async function authenticate(username: string, password: string): Promise<User | null> {
  const user = await findUserByUsername(username);
  if (!user) return null;
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;
  return user;
}
`,
        symbols: ['authenticate'],
        type: 'function',
      },
      {
        id: 'auth.ts:verifyPassword:16',
        filePath: 'auth.ts',
        startLine: 16,
        endLine: 25,
        content: `
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
`,
        symbols: ['verifyPassword'],
        type: 'function',
      },
      {
        id: 'user.ts:User:1',
        filePath: 'user.ts',
        startLine: 1,
        endLine: 10,
        content: `
export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}
`,
        symbols: ['User'],
        type: 'interface',
      },
      {
        id: 'api.ts:handleLogin:1',
        filePath: 'api.ts',
        startLine: 1,
        endLine: 20,
        content: `
export async function handleLogin(req: Request, res: Response) {
  const { username, password } = req.body;
  const user = await authenticate(username, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = generateToken(user);
  return res.json({ token });
}
`,
        symbols: ['handleLogin'],
        type: 'function',
      },
    ];

    const mockFiles = new Map<string, IndexedFile>();

    mockFiles.set('auth.ts', {
      path: '/project/auth.ts',
      relativePath: 'auth.ts',
      language: 'typescript' as SupportedLanguage,
      hash: 'abc123',
      lastModified: Date.now(),
      size: 500,
      symbols: [
        { name: 'authenticate', kind: 'function', startLine: 1, endLine: 15 },
        { name: 'verifyPassword', kind: 'function', startLine: 16, endLine: 25 },
      ],
      chunks: mockChunks.filter((c) => c.filePath === 'auth.ts'),
    });

    mockFiles.set('user.ts', {
      path: '/project/user.ts',
      relativePath: 'user.ts',
      language: 'typescript' as SupportedLanguage,
      hash: 'def456',
      lastModified: Date.now(),
      size: 200,
      symbols: [{ name: 'User', kind: 'interface', startLine: 1, endLine: 10 }],
      chunks: mockChunks.filter((c) => c.filePath === 'user.ts'),
    });

    mockFiles.set('api.ts', {
      path: '/project/api.ts',
      relativePath: 'api.ts',
      language: 'typescript' as SupportedLanguage,
      hash: 'ghi789',
      lastModified: Date.now(),
      size: 350,
      symbols: [{ name: 'handleLogin', kind: 'function', startLine: 1, endLine: 20 }],
      chunks: mockChunks.filter((c) => c.filePath === 'api.ts'),
    });

    mockIndex = {
      version: '1.0.0',
      rootPath: '/project',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files: mockFiles,
      totalChunks: mockChunks.length,
      totalSymbols: 4,
      languages: { typescript: 3 } as Record<SupportedLanguage, number>,
    };

    searchEngine.setIndex(mockIndex);
  });

  describe('Search Engine Creation', () => {
    it('should create search engine', () => {
      const engine = createSearchEngine();
      expect(engine).toBeInstanceOf(CodeSearchEngine);
    });
  });

  describe('Basic Search', () => {
    it('should search for keyword', async () => {
      const query: SearchQuery = {
        query: 'authenticate',
        limit: 10,
      };

      const results = await searchEngine.search(query);

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.chunk.symbols.includes('authenticate'))).toBe(true);
    });

    it('should search for functionality description', async () => {
      const query: SearchQuery = {
        query: 'password verification',
        limit: 10,
      };

      const results = await searchEngine.search(query);

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.chunk.content.includes('password'))).toBe(true);
    });

    it('should return empty results for non-matching query', async () => {
      const query: SearchQuery = {
        query: 'nonexistent functionality xyz123',
        limit: 10,
      };

      const results = await searchEngine.search(query);

      expect(results.length).toBe(0);
    });

    it('should respect limit parameter', async () => {
      const query: SearchQuery = {
        query: 'function',
        limit: 2,
      };

      const results = await searchEngine.search(query);

      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Search Filters', () => {
    it('should filter by language', async () => {
      const query: SearchQuery = {
        query: 'user',
        filters: {
          languages: ['typescript'],
        },
      };

      const results = await searchEngine.search(query);

      results.forEach((r) => {
        expect(r.file.language).toBe('typescript');
      });
    });

    it('should filter by path', async () => {
      const query: SearchQuery = {
        query: 'function',
        filters: {
          paths: ['auth'],
        },
      };

      const results = await searchEngine.search(query);

      results.forEach((r) => {
        expect(r.file.relativePath).toContain('auth');
      });
    });

    it('should exclude paths', async () => {
      const query: SearchQuery = {
        query: 'function',
        filters: {
          excludePaths: ['api'],
        },
      };

      const results = await searchEngine.search(query);

      results.forEach((r) => {
        expect(r.file.relativePath).not.toContain('api');
      });
    });

    it('should filter by chunk type', async () => {
      const query: SearchQuery = {
        query: 'user',
        filters: {
          chunkTypes: ['interface'],
        },
      };

      const results = await searchEngine.search(query);

      results.forEach((r) => {
        expect(r.chunk.type).toBe('interface');
      });
    });
  });

  describe('Symbol Search', () => {
    it('should search by symbol name', () => {
      const results = searchEngine.searchSymbol('authenticate');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunk.symbols).toContain('authenticate');
    });

    it('should return higher score for exact match', () => {
      const results = searchEngine.searchSymbol('User');

      expect(results.length).toBeGreaterThan(0);
      const exactMatch = results.find((r) => r.chunk.symbols.includes('User'));
      expect(exactMatch?.score).toBeGreaterThan(0);
    });

    it('should find partial matches', () => {
      const results = searchEngine.searchSymbol('auth');

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.chunk.symbols.includes('authenticate'))).toBe(true);
    });
  });

  describe('Result Ranking', () => {
    it('should rank exact matches higher', async () => {
      const query: SearchQuery = {
        query: 'authenticate',
        limit: 10,
      };

      const results = await searchEngine.search(query);

      // Results should be sorted by score
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }
    });
  });

  describe('Get All Symbols', () => {
    it('should return all symbols', () => {
      const symbols = searchEngine.getAllSymbols();

      expect(symbols.length).toBe(4);
    });

    it('should filter symbols by kind', () => {
      const symbols = searchEngine.getAllSymbols({
        symbolKinds: ['function'],
      });

      symbols.forEach((s) => {
        expect(s.symbol.kind).toBe('function');
      });
    });

    it('should filter symbols by language', () => {
      const symbols = searchEngine.getAllSymbols({
        languages: ['typescript'],
      });

      symbols.forEach((s) => {
        expect(s.file.language).toBe('typescript');
      });
    });
  });

  describe('Error Handling', () => {
    it('should throw error when no index is set', async () => {
      const engine = createSearchEngine();

      await expect(
        engine.search({ query: 'test' })
      ).rejects.toThrow('No index loaded');
    });
  });
});
