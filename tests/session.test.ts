/**
 * Tests for session persistence module.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import {
  // Factory and persistence
  createSession,
  saveSession,
  loadSession,
  validateSession,
  // Session updates
  updateSessionStatus,
  updateSessionCheckpoint,
  updateSessionSandbox,
  addSessionTrace,
  updateSessionCost,
  completeSession,
  failSession,
  // Session manager
  SessionManager,
  // Utilities
  canResumeSession,
  getSessionProgress,
  exportSession,
  importSession,
  createSessionId,
  // Constants
  SESSION_VERSION,
} from '../src/session.js';
import type { RLMSession, SessionStatus, TraceEntry, TokenUsage } from '../src/index.js';

// =============================================================================
// Test Helpers
// =============================================================================

const TEST_DIR = join(process.cwd(), '.test-sessions');

const createTestConfig = () => ({
  model: 'gpt-4o' as const,
  maxIterations: 20,
  maxDepth: 1,
  sandboxTimeout: 10000,
  temperature: 0,
});

const createTestSession = (overrides: Partial<RLMSession> = {}): RLMSession => {
  const session = createSession(
    'Test query',
    'Test context content',
    createTestConfig()
  );
  return { ...session, ...overrides };
};

// =============================================================================
// createSession Tests
// =============================================================================

describe('createSession', () => {
  it('should create a session with required fields', () => {
    const session = createSession('Find the answer', 'Document content', createTestConfig());

    expect(session.id).toBeDefined();
    expect(session.version).toBe(SESSION_VERSION);
    expect(session.status).toBe('created');
    expect(session.query).toBe('Find the answer');
    expect(session.context).toBe('Document content');
    expect(session.contextMode).toBe('inline');
  });

  it('should use provided config values', () => {
    const config = {
      model: 'claude-sonnet-4-5' as const,
      maxIterations: 50,
      maxDepth: 3,
      sandboxTimeout: 30000,
      temperature: 0.5,
    };

    const session = createSession('Query', 'Context', config);

    expect(session.config.model).toBe('claude-sonnet-4-5');
    expect(session.config.maxIterations).toBe(50);
    expect(session.config.maxDepth).toBe(3);
    expect(session.config.sandboxTimeout).toBe(30000);
    expect(session.config.temperature).toBe(0.5);
  });

  it('should initialize empty checkpoint', () => {
    const session = createSession('Query', 'Context', createTestConfig());

    expect(session.checkpoint.iteration).toBe(0);
    expect(session.checkpoint.depth).toBe(0);
    expect(session.checkpoint.messages).toEqual([]);
  });

  it('should initialize empty cost tracking', () => {
    const session = createSession('Query', 'Context', createTestConfig());

    expect(session.cost.totalTokens).toBe(0);
    expect(session.cost.totalCalls).toBe(0);
    expect(session.cost.estimatedCost).toBe(0);
    expect(session.cost.callBreakdown).toEqual([]);
  });

  it('should set timestamps', () => {
    const before = new Date().toISOString();
    const session = createSession('Query', 'Context', createTestConfig());
    const after = new Date().toISOString();

    expect(session.createdAt >= before).toBe(true);
    expect(session.createdAt <= after).toBe(true);
    expect(session.updatedAt).toBe(session.createdAt);
  });

  it('should accept custom session ID', () => {
    const session = createSession('Query', 'Context', createTestConfig(), {
      id: 'custom-id-123',
    });

    expect(session.id).toBe('custom-id-123');
  });

  it('should store metadata', () => {
    const session = createSession('Query', 'Context', createTestConfig(), {
      name: 'My Session',
      description: 'A test session',
      tags: ['test', 'example'],
    });

    expect(session.metadata.name).toBe('My Session');
    expect(session.metadata.description).toBe('A test session');
    expect(session.metadata.tags).toEqual(['test', 'example']);
  });

  it('should support external context mode', () => {
    const session = createSession('Query', 'Context', createTestConfig(), {
      externalizeContext: true,
    });

    expect(session.contextMode).toBe('file');
    expect(session.context).toBe('');
    expect(session.contextPath).toBeDefined();
  });
});

// =============================================================================
// Session Update Tests
// =============================================================================

describe('Session Updates', () => {
  describe('updateSessionStatus', () => {
    it('should update status', () => {
      const session = createTestSession();
      const updated = updateSessionStatus(session, 'running');

      expect(updated.status).toBe('running');
      expect(updated.startedAt).toBeDefined();
    });

    it('should set startedAt on first running', () => {
      const session = createTestSession();
      const running = updateSessionStatus(session, 'running');

      expect(running.startedAt).toBeDefined();

      // Pausing and resuming should not change startedAt
      const paused = updateSessionStatus(running, 'paused');
      const resumed = updateSessionStatus(paused, 'running');

      expect(resumed.startedAt).toBe(running.startedAt);
    });

    it('should set completedAt on completion', () => {
      const session = createTestSession();
      const completed = updateSessionStatus(session, 'completed');

      expect(completed.completedAt).toBeDefined();
    });

    it('should set completedAt on failure', () => {
      const session = createTestSession();
      const failed = updateSessionStatus(session, 'failed');

      expect(failed.completedAt).toBeDefined();
    });
  });

  describe('updateSessionCheckpoint', () => {
    it('should update checkpoint fields', () => {
      const session = createTestSession();
      const updated = updateSessionCheckpoint(session, {
        iteration: 5,
        depth: 1,
      });

      expect(updated.checkpoint.iteration).toBe(5);
      expect(updated.checkpoint.depth).toBe(1);
    });

    it('should preserve existing checkpoint fields', () => {
      const session = createTestSession();
      const withMessages = updateSessionCheckpoint(session, {
        messages: [{ role: 'user', content: 'Hello' }],
      });
      const updated = updateSessionCheckpoint(withMessages, {
        iteration: 3,
      });

      expect(updated.checkpoint.messages).toHaveLength(1);
      expect(updated.checkpoint.iteration).toBe(3);
    });
  });

  describe('updateSessionSandbox', () => {
    it('should update sandbox variables', () => {
      const session = createTestSession();
      const updated = updateSessionSandbox(session, {
        variables: { result: 42, items: [1, 2, 3] },
      });

      expect(updated.sandbox.variables).toEqual({ result: 42, items: [1, 2, 3] });
    });

    it('should update sandbox output', () => {
      const session = createTestSession();
      const updated = updateSessionSandbox(session, {
        output: ['Line 1', 'Line 2'],
      });

      expect(updated.sandbox.output).toEqual(['Line 1', 'Line 2']);
    });
  });

  describe('addSessionTrace', () => {
    it('should add trace entry', () => {
      const session = createTestSession();
      const entry: TraceEntry = {
        type: 'llm_call',
        depth: 0,
        timestamp: Date.now(),
        data: { content: 'test' } as any,
      };

      const updated = addSessionTrace(session, entry);

      expect(updated.trace).toHaveLength(1);
      expect(updated.trace[0]).toBe(entry);
    });

    it('should append to existing traces', () => {
      const session = createTestSession();
      const entry1: TraceEntry = {
        type: 'llm_call',
        depth: 0,
        timestamp: Date.now(),
        data: { content: 'first' } as any,
      };
      const entry2: TraceEntry = {
        type: 'code_execution',
        depth: 0,
        timestamp: Date.now(),
        data: { content: 'second' } as any,
      };

      const updated1 = addSessionTrace(session, entry1);
      const updated2 = addSessionTrace(updated1, entry2);

      expect(updated2.trace).toHaveLength(2);
    });
  });

  describe('updateSessionCost', () => {
    it('should accumulate costs', () => {
      const session = createTestSession();
      const usage: TokenUsage = {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      };

      const updated = updateSessionCost(session, usage, 0.005);

      expect(updated.cost.totalTokens).toBe(150);
      expect(updated.cost.totalCalls).toBe(1);
      expect(updated.cost.estimatedCost).toBe(0.005);
      expect(updated.cost.callBreakdown).toHaveLength(1);
    });

    it('should accumulate multiple costs', () => {
      const session = createTestSession();
      const usage1: TokenUsage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };
      const usage2: TokenUsage = { promptTokens: 200, completionTokens: 100, totalTokens: 300 };

      const updated1 = updateSessionCost(session, usage1, 0.005);
      const updated2 = updateSessionCost(updated1, usage2, 0.01);

      expect(updated2.cost.totalTokens).toBe(450);
      expect(updated2.cost.totalCalls).toBe(2);
      expect(updated2.cost.estimatedCost).toBe(0.015);
      expect(updated2.cost.callBreakdown).toHaveLength(2);
    });
  });

  describe('completeSession', () => {
    it('should mark session as completed with result', () => {
      const session = createTestSession();
      const completed = completeSession(session, 'The answer is 42', 5000);

      expect(completed.status).toBe('completed');
      expect(completed.result?.response).toBe('The answer is 42');
      expect(completed.result?.executionTime).toBe(5000);
      expect(completed.completedAt).toBeDefined();
    });
  });

  describe('failSession', () => {
    it('should mark session as failed with error', () => {
      const session = createTestSession();
      const error = new Error('Something went wrong');
      const failed = failSession(session, error);

      expect(failed.status).toBe('failed');
      expect(failed.error?.message).toBe('Something went wrong');
      expect(failed.completedAt).toBeDefined();
    });

    it('should capture error stack', () => {
      const session = createTestSession();
      const error = new Error('Test error');
      const failed = failSession(session, error);

      expect(failed.error?.stack).toBeDefined();
    });
  });
});

// =============================================================================
// Persistence Tests
// =============================================================================

describe('Session Persistence', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('saveSession', () => {
    it('should save session to file', async () => {
      const session = createTestSession();
      const path = join(TEST_DIR, 'test-session.json');

      await saveSession(session, path);

      const content = await readFile(path, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.id).toBe(session.id);
      expect(parsed.query).toBe(session.query);
    });

    it('should create directory if needed', async () => {
      const session = createTestSession();
      const path = join(TEST_DIR, 'subdir', 'test-session.json');

      await saveSession(session, path, { createDir: true });

      const content = await readFile(path, 'utf-8');
      expect(content).toBeDefined();
    });

    it('should pretty print by default', async () => {
      const session = createTestSession();
      const path = join(TEST_DIR, 'pretty.json');

      await saveSession(session, path);

      const content = await readFile(path, 'utf-8');
      expect(content).toContain('\n');
    });

    it('should support compact output', async () => {
      const session = createTestSession();
      const path = join(TEST_DIR, 'compact.json');

      await saveSession(session, path, { pretty: false });

      const content = await readFile(path, 'utf-8');
      expect(content).not.toContain('\n  ');
    });

    it('should externalize large context', async () => {
      const largeContext = 'x'.repeat(200 * 1024); // 200KB
      const session = createSession('Query', largeContext, createTestConfig());
      const path = join(TEST_DIR, 'large.json');

      await saveSession(session, path, { externalizeContextThreshold: 100 * 1024 });

      const saved = JSON.parse(await readFile(path, 'utf-8'));
      expect(saved.contextMode).toBe('file');
      expect(saved.context).toBe('');

      const contextPath = path.replace(/\.json$/, '.context.txt');
      const contextContent = await readFile(contextPath, 'utf-8');
      expect(contextContent.length).toBe(200 * 1024);
    });
  });

  describe('loadSession', () => {
    it('should load session from file', async () => {
      const session = createTestSession({ id: 'load-test' });
      const path = join(TEST_DIR, 'load-test.json');

      await saveSession(session, path);
      const loaded = await loadSession(path);

      expect(loaded.id).toBe('load-test');
      expect(loaded.query).toBe(session.query);
      expect(loaded.context).toBe(session.context);
    });

    it('should load external context', async () => {
      const session = createSession('Query', 'External content', createTestConfig(), {
        externalizeContext: true,
      });
      const path = join(TEST_DIR, 'external.json');
      const contextPath = join(TEST_DIR, `${session.id}.context.txt`);

      // Save session and context file
      await saveSession(session, path);
      await writeFile(contextPath, 'External content', 'utf-8');

      // Update session to point to context file
      const savedSession = JSON.parse(await readFile(path, 'utf-8'));
      savedSession.contextPath = `${session.id}.context.txt`;
      await writeFile(path, JSON.stringify(savedSession), 'utf-8');

      const loaded = await loadSession(path);

      expect(loaded.context).toBe('External content');
    });

    it('should validate session by default', async () => {
      const path = join(TEST_DIR, 'invalid.json');
      await writeFile(path, '{"invalid": true}', 'utf-8');

      await expect(loadSession(path)).rejects.toThrow('Invalid session');
    });

    it('should skip validation when disabled', async () => {
      const path = join(TEST_DIR, 'invalid.json');
      await writeFile(path, '{"id": "test", "query": "q"}', 'utf-8');

      const loaded = await loadSession(path, { validate: false });
      expect(loaded.id).toBe('test');
    });
  });

  describe('validateSession', () => {
    it('should validate required fields', () => {
      expect(() => validateSession({})).toThrow('missing required field');
      expect(() => validateSession({ id: '1' })).toThrow('missing required field');
    });

    it('should validate status', () => {
      const session = createTestSession();
      (session as any).status = 'invalid';

      expect(() => validateSession(session)).toThrow('unknown status');
    });

    it('should accept valid session', () => {
      const session = createTestSession();
      expect(() => validateSession(session)).not.toThrow();
    });
  });
});

// =============================================================================
// SessionManager Tests
// =============================================================================

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    manager = new SessionManager(TEST_DIR);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('create', () => {
    it('should create a new session', () => {
      const session = manager.create('Query', 'Context', createTestConfig());

      expect(session.id).toBeDefined();
      expect(session.query).toBe('Query');
    });
  });

  describe('save and load', () => {
    it('should save and load session', async () => {
      const session = manager.create('Query', 'Context', createTestConfig());

      await manager.save(session);
      const loaded = await manager.load(session.id);

      expect(loaded.id).toBe(session.id);
    });
  });

  describe('exists', () => {
    it('should return true for existing session', async () => {
      const session = manager.create('Query', 'Context', createTestConfig());
      await manager.save(session);

      expect(await manager.exists(session.id)).toBe(true);
    });

    it('should return false for non-existing session', async () => {
      expect(await manager.exists('non-existing')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete session', async () => {
      const session = manager.create('Query', 'Context', createTestConfig());
      await manager.save(session);

      await manager.delete(session.id);

      expect(await manager.exists(session.id)).toBe(false);
    });
  });

  describe('list', () => {
    it('should list all sessions', async () => {
      const session1 = manager.create('Query 1', 'Context', createTestConfig());
      const session2 = manager.create('Query 2', 'Context', createTestConfig());

      await manager.save(session1);
      await manager.save(session2);

      const list = await manager.list();

      expect(list.length).toBe(2);
    });

    it('should return empty array for empty directory', async () => {
      const list = await manager.list();
      expect(list).toEqual([]);
    });

    it('should truncate long queries', async () => {
      const longQuery = 'x'.repeat(200);
      const session = manager.create(longQuery, 'Context', createTestConfig());
      await manager.save(session);

      const list = await manager.list();

      expect(list[0].query.length).toBeLessThanOrEqual(103); // 100 + '...'
    });
  });

  describe('find', () => {
    it('should find sessions by status', async () => {
      const session1 = updateSessionStatus(
        manager.create('Query 1', 'Context', createTestConfig()),
        'completed'
      );
      const session2 = updateSessionStatus(
        manager.create('Query 2', 'Context', createTestConfig()),
        'paused'
      );

      await manager.save(session1);
      await manager.save(session2);

      const completed = await manager.find({ status: 'completed' });
      const paused = await manager.find({ status: 'paused' });

      expect(completed.length).toBe(1);
      expect(paused.length).toBe(1);
    });

    it('should find sessions by model', async () => {
      const session1 = manager.create('Query 1', 'Context', { model: 'gpt-4o' });
      const session2 = manager.create('Query 2', 'Context', { model: 'claude-sonnet-4-5' });

      await manager.save(session1);
      await manager.save(session2);

      const gptSessions = await manager.find({ model: 'gpt-4o' });

      expect(gptSessions.length).toBe(1);
    });
  });

  describe('getResumable', () => {
    it('should return paused sessions', async () => {
      const session1 = updateSessionStatus(
        manager.create('Query 1', 'Context', createTestConfig()),
        'paused'
      );
      const session2 = updateSessionStatus(
        manager.create('Query 2', 'Context', createTestConfig()),
        'completed'
      );

      await manager.save(session1);
      await manager.save(session2);

      const resumable = await manager.getResumable();

      expect(resumable.length).toBe(1);
      expect(resumable[0].status).toBe('paused');
    });
  });

  describe('cleanup', () => {
    it('should delete old completed sessions', async () => {
      // Create a completed session
      const oldSession = completeSession(
        manager.create('Old', 'Context', createTestConfig()),
        'result',
        1000
      );

      const newSession = completeSession(
        manager.create('New', 'Context', createTestConfig()),
        'result',
        1000
      );

      await manager.save(oldSession);
      await manager.save(newSession);

      // Manually modify the saved file to have old timestamp
      const oldPath = manager.getSessionPath(oldSession.id);
      const oldContent = JSON.parse(await readFile(oldPath, 'utf-8'));
      oldContent.updatedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      await writeFile(oldPath, JSON.stringify(oldContent), 'utf-8');

      // Cleanup sessions older than 1 day
      const deleted = await manager.cleanup(24 * 60 * 60 * 1000);

      expect(deleted).toBe(1);
      expect(await manager.exists(oldSession.id)).toBe(false);
      expect(await manager.exists(newSession.id)).toBe(true);
    });
  });
});

// =============================================================================
// Utility Function Tests
// =============================================================================

describe('Utility Functions', () => {
  describe('canResumeSession', () => {
    it('should return true for created sessions', () => {
      const session = createTestSession({ status: 'created' });
      expect(canResumeSession(session)).toBe(true);
    });

    it('should return true for paused sessions', () => {
      const session = createTestSession({ status: 'paused' });
      expect(canResumeSession(session)).toBe(true);
    });

    it('should return true for interrupted sessions', () => {
      const session = createTestSession({ status: 'interrupted' });
      expect(canResumeSession(session)).toBe(true);
    });

    it('should return false for completed sessions', () => {
      const session = createTestSession({ status: 'completed' });
      expect(canResumeSession(session)).toBe(false);
    });

    it('should return false for failed sessions', () => {
      const session = createTestSession({ status: 'failed' });
      expect(canResumeSession(session)).toBe(false);
    });

    it('should return false for running sessions', () => {
      const session = createTestSession({ status: 'running' });
      expect(canResumeSession(session)).toBe(false);
    });
  });

  describe('getSessionProgress', () => {
    it('should calculate progress for new session', () => {
      const session = createTestSession();
      const progress = getSessionProgress(session);

      expect(progress.iteration).toBe(0);
      expect(progress.percentComplete).toBe(0);
      expect(progress.status).toBe('created');
    });

    it('should calculate progress for in-progress session', () => {
      const session = updateSessionCheckpoint(createTestSession(), { iteration: 5 });
      const progress = getSessionProgress(session);

      expect(progress.iteration).toBe(5);
      expect(progress.percentComplete).toBe(25); // 5/20 * 100
    });

    it('should show 100% for completed session', () => {
      const session = createTestSession({ status: 'completed' });
      const progress = getSessionProgress(session);

      expect(progress.percentComplete).toBe(100);
    });

    it('should cap progress at 99% for running sessions', () => {
      const session = updateSessionCheckpoint(createTestSession(), { iteration: 20 });
      const progress = getSessionProgress(session);

      expect(progress.percentComplete).toBe(99);
    });

    it('should include cost information', () => {
      const session = updateSessionCost(
        createTestSession(),
        { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        0.005
      );
      const progress = getSessionProgress(session);

      expect(progress.tokensUsed).toBe(150);
      expect(progress.costSoFar).toBe(0.005);
    });
  });

  describe('exportSession', () => {
    it('should export session as JSON string', () => {
      const session = createTestSession();
      const exported = exportSession(session);

      expect(typeof exported).toBe('string');
      expect(JSON.parse(exported).id).toBe(session.id);
    });

    it('should be pretty-printed', () => {
      const session = createTestSession();
      const exported = exportSession(session);

      expect(exported).toContain('\n');
    });
  });

  describe('importSession', () => {
    it('should import session from JSON string', () => {
      const session = createTestSession();
      const exported = exportSession(session);
      const imported = importSession(exported);

      expect(imported.id).toBe(session.id);
      expect(imported.query).toBe(session.query);
    });

    it('should validate imported session', () => {
      expect(() => importSession('{}')).toThrow('Invalid session');
    });
  });

  describe('createSessionId', () => {
    it('should create deterministic ID from query', () => {
      const date = new Date('2026-01-20');
      const id1 = createSessionId('Test query', date);
      const id2 = createSessionId('Test query', date);

      expect(id1).toBe(id2);
    });

    it('should include date prefix', () => {
      const date = new Date('2026-01-20');
      const id = createSessionId('Test query', date);

      expect(id.startsWith('2026-01-20-')).toBe(true);
    });

    it('should create different IDs for different queries', () => {
      const date = new Date('2026-01-20');
      const id1 = createSessionId('Query 1', date);
      const id2 = createSessionId('Query 2', date);

      expect(id1).not.toBe(id2);
    });
  });
});
