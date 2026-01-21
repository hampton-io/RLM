/**
 * Find Security Issues Tool Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findSecurityIssuesHandler, findSecurityIssuesDefinition } from '../src/tools/find-security-issues.js';
import { ToolContext, CodebaseIndex, IndexedFile, RLMServerConfig, DEFAULT_CONFIG } from '../src/types.js';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('findSecurityIssues', () => {
  const testDir = join(tmpdir(), 'rlm-security-test-' + Date.now());

  // Create mock context
  function createMockContext(files: Map<string, IndexedFile>): ToolContext {
    const index: CodebaseIndex = {
      version: '1.0.0',
      rootPath: testDir,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files,
      totalChunks: 0,
      totalSymbols: 0,
      languages: {} as any,
    };

    return {
      config: DEFAULT_CONFIG,
      index,
    };
  }

  // Create mock file
  function createMockFile(path: string, relativePath: string): IndexedFile {
    return {
      path,
      relativePath,
      language: 'typescript',
      hash: 'test-hash',
      lastModified: Date.now(),
      size: 100,
      symbols: [],
      chunks: [],
    };
  }

  beforeEach(async () => {
    // Clean up and create test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {}
    await mkdir(testDir, { recursive: true });
  });

  describe('Tool Definition', () => {
    it('should have correct name', () => {
      expect(findSecurityIssuesDefinition.name).toBe('find_security_issues');
    });

    it('should have description', () => {
      expect(findSecurityIssuesDefinition.description).toBeDefined();
      expect(findSecurityIssuesDefinition.description).toContain('security');
    });

    it('should have input schema', () => {
      expect(findSecurityIssuesDefinition.inputSchema).toBeDefined();
      expect(findSecurityIssuesDefinition.inputSchema.type).toBe('object');
    });
  });

  describe('Handler', () => {
    it('should throw error if index is not available', async () => {
      const context: ToolContext = {
        config: DEFAULT_CONFIG,
        index: null,
      };

      await expect(findSecurityIssuesHandler({}, context)).rejects.toThrow('not been indexed');
    });

    it('should detect hardcoded API keys', async () => {
      const filePath = join(testDir, 'config.ts');
      await writeFile(filePath, `
        const config = {
          api_key: "sk-1234567890abcdef1234567890abcdef"
        };
      `);

      const files = new Map<string, IndexedFile>();
      files.set(filePath, createMockFile(filePath, 'config.ts'));
      const context = createMockContext(files);

      const result = await findSecurityIssuesHandler({}, context);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some(i => i.type.includes('api-key') || i.type.includes('secret'))).toBe(true);
    });

    it('should detect hardcoded passwords', async () => {
      const filePath = join(testDir, 'auth.ts');
      await writeFile(filePath, `
        const password = "mysecretpassword123";
      `);

      const files = new Map<string, IndexedFile>();
      files.set(filePath, createMockFile(filePath, 'auth.ts'));
      const context = createMockContext(files);

      const result = await findSecurityIssuesHandler({}, context);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some(i => i.type.includes('password'))).toBe(true);
    });

    it('should detect innerHTML XSS', async () => {
      const filePath = join(testDir, 'dom.ts');
      await writeFile(filePath, `
        element.innerHTML = userInput;
      `);

      const files = new Map<string, IndexedFile>();
      files.set(filePath, createMockFile(filePath, 'dom.ts'));
      const context = createMockContext(files);

      const result = await findSecurityIssuesHandler({}, context);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some(i => i.type.includes('innerhtml'))).toBe(true);
    });

    it('should detect unsafe eval', async () => {
      const filePath = join(testDir, 'eval.ts');
      await writeFile(filePath, `
        const result = eval(userCode);
      `);

      const files = new Map<string, IndexedFile>();
      files.set(filePath, createMockFile(filePath, 'eval.ts'));
      const context = createMockContext(files);

      const result = await findSecurityIssuesHandler({}, context);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some(i => i.type.includes('eval'))).toBe(true);
    });

    it('should detect dangerouslySetInnerHTML', async () => {
      const filePath = join(testDir, 'react.tsx');
      await writeFile(filePath, `
        <div dangerouslySetInnerHTML={{ __html: userContent }} />
      `);

      const files = new Map<string, IndexedFile>();
      files.set(filePath, createMockFile(filePath, 'react.tsx'));
      const context = createMockContext(files);

      const result = await findSecurityIssuesHandler({}, context);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some(i => i.type.includes('dangerouslysetinnerhtml'))).toBe(true);
    });

    it('should filter by severity', async () => {
      const filePath = join(testDir, 'mixed.ts');
      await writeFile(filePath, `
        // Critical: hardcoded password
        const password = "secret123";
        // Low: Math.random for security
        const token = Math.random().toString(36);
      `);

      const files = new Map<string, IndexedFile>();
      files.set(filePath, createMockFile(filePath, 'mixed.ts'));
      const context = createMockContext(files);

      // Get only critical issues
      const result = await findSecurityIssuesHandler({ severity: 'critical' }, context);
      expect(result.issues.every(i => i.severity === 'critical')).toBe(true);
    });

    it('should filter by category', async () => {
      const filePath = join(testDir, 'mixed2.ts');
      await writeFile(filePath, `
        // Secrets category
        const api_key = "sk-1234567890abcdef1234567890abcdef";
        // XSS category
        element.innerHTML = userInput;
      `);

      const files = new Map<string, IndexedFile>();
      files.set(filePath, createMockFile(filePath, 'mixed2.ts'));
      const context = createMockContext(files);

      // Get only XSS issues
      const result = await findSecurityIssuesHandler({ categories: ['xss'] }, context);
      expect(result.issues.every(i => i.type.includes('xss') || i.type.includes('innerhtml'))).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const filePath = join(testDir, 'many-issues.ts');
      await writeFile(filePath, `
        const a1 = eval("1");
        const a2 = eval("2");
        const a3 = eval("3");
        const a4 = eval("4");
        const a5 = eval("5");
      `);

      const files = new Map<string, IndexedFile>();
      files.set(filePath, createMockFile(filePath, 'many-issues.ts'));
      const context = createMockContext(files);

      const result = await findSecurityIssuesHandler({ limit: 2 }, context);
      expect(result.issues.length).toBe(2);
    });

    it('should skip test files', async () => {
      const filePath = join(testDir, 'auth.test.ts');
      await writeFile(filePath, `
        // This is a test file with intentional security issues for testing
        const password = "testpassword123";
      `);

      const files = new Map<string, IndexedFile>();
      files.set(filePath, createMockFile(filePath, 'auth.test.ts'));
      const context = createMockContext(files);

      const result = await findSecurityIssuesHandler({}, context);
      expect(result.issues.length).toBe(0);
    });

    it('should provide summary statistics', async () => {
      const filePath = join(testDir, 'summary.ts');
      await writeFile(filePath, `
        const password = "secret";
        element.innerHTML = input;
      `);

      const files = new Map<string, IndexedFile>();
      files.set(filePath, createMockFile(filePath, 'summary.ts'));
      const context = createMockContext(files);

      const result = await findSecurityIssuesHandler({}, context);
      expect(result.summary).toBeDefined();
      expect(typeof result.summary.total).toBe('number');
      expect(typeof result.summary.critical).toBe('number');
      expect(typeof result.summary.high).toBe('number');
      expect(typeof result.summary.medium).toBe('number');
      expect(typeof result.summary.low).toBe('number');
    });
  });
});
