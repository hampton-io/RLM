/**
 * Session persistence for RLM execution.
 *
 * Enables saving and resuming RLM sessions, allowing for:
 * - Interruption recovery
 * - Long-running task checkpointing
 * - Session sharing and debugging
 */

import { randomUUID, createHash } from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import type {
  Message,
  RLMOptions,
  TraceEntry,
  TokenUsage,
  SupportedModel,
  ModelProvider,
  ExtendedThinkingConfig,
} from './types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Session status indicating current state.
 */
export type SessionStatus =
  | 'created' // Session created but not started
  | 'running' // Currently executing
  | 'paused' // Execution paused (can be resumed)
  | 'completed' // Finished successfully
  | 'failed' // Finished with error
  | 'interrupted'; // Manually interrupted

/**
 * Execution checkpoint for resumption.
 */
export interface ExecutionCheckpoint {
  /** Current iteration number */
  iteration: number;
  /** Current recursion depth */
  depth: number;
  /** Conversation messages so far */
  messages: Message[];
  /** Last LLM response (if any) */
  lastResponse?: string;
  /** Whether waiting for code execution result */
  awaitingCodeResult?: boolean;
}

/**
 * Sandbox state snapshot.
 */
export interface SandboxSnapshot {
  /** Variables in sandbox scope */
  variables: Record<string, unknown>;
  /** Console output captured so far */
  output: string[];
}

/**
 * Cost accumulator for the session.
 */
export interface SessionCost {
  /** Total tokens used */
  totalTokens: number;
  /** Total LLM calls made */
  totalCalls: number;
  /** Estimated cost in USD */
  estimatedCost: number;
  /** Per-call breakdown */
  callBreakdown: Array<{
    callNumber: number;
    usage: TokenUsage;
    cost: number;
  }>;
}

/**
 * Session metadata.
 */
export interface SessionMetadata {
  /** Human-readable name for the session */
  name?: string;
  /** Session description */
  description?: string;
  /** Custom tags for organization */
  tags?: string[];
  /** User-defined metadata */
  custom?: Record<string, unknown>;
}

/**
 * Complete RLM session state.
 */
export interface RLMSession {
  /** Unique session identifier */
  id: string;
  /** Session version for compatibility */
  version: string;
  /** Session status */
  status: SessionStatus;

  /** Original query */
  query: string;
  /** Original context (or reference to external file) */
  context: string;
  /** Context storage mode */
  contextMode: 'inline' | 'file';
  /** Path to external context file (if contextMode is 'file') */
  contextPath?: string;

  /** RLM configuration used */
  config: {
    model: SupportedModel;
    provider?: ModelProvider;
    maxIterations: number;
    maxDepth: number;
    sandboxTimeout: number;
    temperature: number;
    extendedThinking?: ExtendedThinkingConfig;
  };

  /** Execution checkpoint for resumption */
  checkpoint: ExecutionCheckpoint;

  /** Sandbox state snapshot */
  sandbox: SandboxSnapshot;

  /** Execution trace log */
  trace: TraceEntry[];

  /** Cost accumulator */
  cost: SessionCost;

  /** Final result (if completed) */
  result?: {
    response: string;
    executionTime: number;
  };

  /** Error information (if failed) */
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };

  /** Timestamps */
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;

  /** Session metadata */
  metadata: SessionMetadata;
}

/**
 * Options for creating a new session.
 */
export interface CreateSessionOptions {
  /** Human-readable session name */
  name?: string;
  /** Session description */
  description?: string;
  /** Custom tags */
  tags?: string[];
  /** Store context in external file (for large contexts) */
  externalizeContext?: boolean;
  /** Custom session ID (defaults to UUID) */
  id?: string;
}

/**
 * Options for saving a session.
 */
export interface SaveSessionOptions {
  /** Pretty-print JSON output */
  pretty?: boolean;
  /** Create directory if it doesn't exist */
  createDir?: boolean;
  /** Externalize large context to separate file */
  externalizeContextThreshold?: number;
}

/**
 * Options for loading a session.
 */
export interface LoadSessionOptions {
  /** Validate session structure */
  validate?: boolean;
  /** Load external context file */
  loadExternalContext?: boolean;
}

/**
 * Session list entry (lightweight).
 */
export interface SessionListEntry {
  id: string;
  name?: string;
  status: SessionStatus;
  query: string;
  model: SupportedModel;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Current session format version */
export const SESSION_VERSION = '1.0.0';

/** Default session directory */
export const DEFAULT_SESSION_DIR = '.rlm-sessions';

/** Context size threshold for externalization (100KB) */
const DEFAULT_EXTERNALIZE_THRESHOLD = 100 * 1024;

// =============================================================================
// Session Factory
// =============================================================================

/**
 * Create a new RLM session.
 *
 * @param query - The query to process
 * @param context - The context to process
 * @param config - RLM configuration
 * @param options - Session creation options
 * @returns New session object
 *
 * @example
 * ```ts
 * const session = createSession(
 *   'Find the secret code',
 *   longDocument,
 *   { model: 'gpt-4o', maxIterations: 20 }
 * );
 * ```
 */
export function createSession(
  query: string,
  context: string,
  config: RLMOptions,
  options: CreateSessionOptions = {}
): RLMSession {
  const now = new Date().toISOString();
  const id = options.id ?? randomUUID();

  return {
    id,
    version: SESSION_VERSION,
    status: 'created',

    query,
    context: options.externalizeContext ? '' : context,
    contextMode: options.externalizeContext ? 'file' : 'inline',
    contextPath: options.externalizeContext ? `${id}.context.txt` : undefined,

    config: {
      model: config.model,
      provider: config.provider,
      maxIterations: config.maxIterations ?? 20,
      maxDepth: config.maxDepth ?? 1,
      sandboxTimeout: config.sandboxTimeout ?? 10000,
      temperature: config.temperature ?? 0,
      extendedThinking: config.extendedThinking,
    },

    checkpoint: {
      iteration: 0,
      depth: 0,
      messages: [],
    },

    sandbox: {
      variables: {},
      output: [],
    },

    trace: [],

    cost: {
      totalTokens: 0,
      totalCalls: 0,
      estimatedCost: 0,
      callBreakdown: [],
    },

    createdAt: now,
    updatedAt: now,

    metadata: {
      name: options.name,
      description: options.description,
      tags: options.tags,
    },
  };
}

// =============================================================================
// Session Persistence
// =============================================================================

/**
 * Save a session to a file.
 *
 * @param session - Session to save
 * @param path - File path to save to
 * @param options - Save options
 *
 * @example
 * ```ts
 * await saveSession(session, './sessions/my-session.json');
 * ```
 */
export async function saveSession(
  session: RLMSession,
  path: string,
  options: SaveSessionOptions = {}
): Promise<void> {
  const {
    pretty = true,
    createDir = true,
    externalizeContextThreshold = DEFAULT_EXTERNALIZE_THRESHOLD,
  } = options;

  // Create directory if needed
  if (createDir) {
    await mkdir(dirname(path), { recursive: true });
  }

  // Update timestamp
  const sessionToSave = {
    ...session,
    updatedAt: new Date().toISOString(),
  };

  // Externalize large context
  if (
    sessionToSave.contextMode === 'inline' &&
    sessionToSave.context.length > externalizeContextThreshold
  ) {
    const contextPath = path.replace(/\.json$/, '.context.txt');
    await writeFile(contextPath, sessionToSave.context, 'utf-8');
    sessionToSave.context = '';
    sessionToSave.contextMode = 'file';
    sessionToSave.contextPath = contextPath;
  }

  // Save session JSON
  const json = pretty ? JSON.stringify(sessionToSave, null, 2) : JSON.stringify(sessionToSave);

  await writeFile(path, json, 'utf-8');
}

/**
 * Load a session from a file.
 *
 * @param path - File path to load from
 * @param options - Load options
 * @returns Loaded session
 *
 * @example
 * ```ts
 * const session = await loadSession('./sessions/my-session.json');
 * ```
 */
export async function loadSession(
  path: string,
  options: LoadSessionOptions = {}
): Promise<RLMSession> {
  const { validate = true, loadExternalContext = true } = options;

  // Load session JSON
  const json = await readFile(path, 'utf-8');
  const session: RLMSession = JSON.parse(json);

  // Validate session structure
  if (validate) {
    validateSession(session);
  }

  // Load external context if needed
  if (loadExternalContext && session.contextMode === 'file' && session.contextPath) {
    // Resolve context path relative to session file
    const contextPath = session.contextPath.startsWith('/')
      ? session.contextPath
      : join(dirname(path), session.contextPath);

    session.context = await readFile(contextPath, 'utf-8');
  }

  return session;
}

/**
 * Validate a session object structure.
 *
 * @param session - Session to validate
 * @throws Error if session is invalid
 */
export function validateSession(session: unknown): asserts session is RLMSession {
  if (!session || typeof session !== 'object') {
    throw new Error('Invalid session: expected object');
  }

  const s = session as Record<string, unknown>;

  // Required fields
  const requiredFields = [
    'id',
    'version',
    'status',
    'query',
    'config',
    'checkpoint',
    'trace',
    'cost',
  ];
  for (const field of requiredFields) {
    if (!(field in s)) {
      throw new Error(`Invalid session: missing required field '${field}'`);
    }
  }

  // Version check
  if (typeof s.version !== 'string') {
    throw new Error('Invalid session: version must be a string');
  }

  // Status check
  const validStatuses: SessionStatus[] = [
    'created',
    'running',
    'paused',
    'completed',
    'failed',
    'interrupted',
  ];
  if (!validStatuses.includes(s.status as SessionStatus)) {
    throw new Error(`Invalid session: unknown status '${s.status}'`);
  }
}

// =============================================================================
// Session Management
// =============================================================================

/**
 * Update session status.
 *
 * @param session - Session to update
 * @param status - New status
 * @returns Updated session
 */
export function updateSessionStatus(session: RLMSession, status: SessionStatus): RLMSession {
  const now = new Date().toISOString();

  return {
    ...session,
    status,
    updatedAt: now,
    startedAt: status === 'running' && !session.startedAt ? now : session.startedAt,
    completedAt: ['completed', 'failed'].includes(status) ? now : session.completedAt,
  };
}

/**
 * Update session checkpoint.
 *
 * @param session - Session to update
 * @param checkpoint - New checkpoint data
 * @returns Updated session
 */
export function updateSessionCheckpoint(
  session: RLMSession,
  checkpoint: Partial<ExecutionCheckpoint>
): RLMSession {
  return {
    ...session,
    checkpoint: {
      ...session.checkpoint,
      ...checkpoint,
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Update session sandbox state.
 *
 * @param session - Session to update
 * @param sandbox - New sandbox state
 * @returns Updated session
 */
export function updateSessionSandbox(
  session: RLMSession,
  sandbox: Partial<SandboxSnapshot>
): RLMSession {
  return {
    ...session,
    sandbox: {
      ...session.sandbox,
      ...sandbox,
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Add trace entry to session.
 *
 * @param session - Session to update
 * @param entry - Trace entry to add
 * @returns Updated session
 */
export function addSessionTrace(session: RLMSession, entry: TraceEntry): RLMSession {
  return {
    ...session,
    trace: [...session.trace, entry],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Update session cost.
 *
 * @param session - Session to update
 * @param usage - Token usage from call
 * @param cost - Cost of call
 * @returns Updated session
 */
export function updateSessionCost(
  session: RLMSession,
  usage: TokenUsage,
  cost: number
): RLMSession {
  const callNumber = session.cost.totalCalls + 1;

  return {
    ...session,
    cost: {
      totalTokens: session.cost.totalTokens + usage.totalTokens,
      totalCalls: callNumber,
      estimatedCost: session.cost.estimatedCost + cost,
      callBreakdown: [...session.cost.callBreakdown, { callNumber, usage, cost }],
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Mark session as completed with result.
 *
 * @param session - Session to complete
 * @param response - Final response
 * @param executionTime - Total execution time
 * @returns Completed session
 */
export function completeSession(
  session: RLMSession,
  response: string,
  executionTime: number
): RLMSession {
  return {
    ...session,
    status: 'completed',
    result: { response, executionTime },
    updatedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
}

/**
 * Mark session as failed with error.
 *
 * @param session - Session to mark as failed
 * @param error - Error that caused failure
 * @returns Failed session
 */
export function failSession(session: RLMSession, error: Error): RLMSession {
  return {
    ...session,
    status: 'failed',
    error: {
      message: error.message,
      code: (error as { code?: string }).code,
      stack: error.stack,
    },
    updatedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
}

// =============================================================================
// Session Manager Class
// =============================================================================

/**
 * Session manager for handling multiple sessions.
 *
 * @example
 * ```ts
 * const manager = new SessionManager('./sessions');
 *
 * // Create and save a new session
 * const session = manager.create('Find X', context, { model: 'gpt-4o' });
 * await manager.save(session);
 *
 * // List all sessions
 * const sessions = await manager.list();
 *
 * // Load a specific session
 * const loaded = await manager.load(session.id);
 * ```
 */
export class SessionManager {
  private baseDir: string;

  constructor(baseDir: string = DEFAULT_SESSION_DIR) {
    this.baseDir = baseDir;
  }

  /**
   * Create a new session.
   */
  create(
    query: string,
    context: string,
    config: RLMOptions,
    options: CreateSessionOptions = {}
  ): RLMSession {
    return createSession(query, context, config, options);
  }

  /**
   * Get the file path for a session.
   */
  getSessionPath(sessionId: string): string {
    return join(this.baseDir, `${sessionId}.json`);
  }

  /**
   * Save a session.
   */
  async save(session: RLMSession, options: SaveSessionOptions = {}): Promise<void> {
    const path = this.getSessionPath(session.id);
    await saveSession(session, path, options);
  }

  /**
   * Load a session by ID.
   */
  async load(sessionId: string, options: LoadSessionOptions = {}): Promise<RLMSession> {
    const path = this.getSessionPath(sessionId);
    return loadSession(path, options);
  }

  /**
   * Check if a session exists.
   */
  async exists(sessionId: string): Promise<boolean> {
    try {
      await readFile(this.getSessionPath(sessionId), 'utf-8');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a session.
   */
  async delete(sessionId: string): Promise<void> {
    const { unlink } = await import('fs/promises');
    const path = this.getSessionPath(sessionId);

    // Delete main session file
    await unlink(path);

    // Try to delete context file if it exists
    try {
      await unlink(path.replace(/\.json$/, '.context.txt'));
    } catch {
      // Ignore if context file doesn't exist
    }
  }

  /**
   * List all sessions in the directory.
   */
  async list(): Promise<SessionListEntry[]> {
    const { readdir } = await import('fs/promises');

    try {
      await mkdir(this.baseDir, { recursive: true });
      const files = await readdir(this.baseDir);
      const sessionFiles = files.filter((f) => f.endsWith('.json'));

      const entries: SessionListEntry[] = [];

      for (const file of sessionFiles) {
        try {
          const session = await loadSession(join(this.baseDir, file), {
            validate: false,
            loadExternalContext: false,
          });

          entries.push({
            id: session.id,
            name: session.metadata.name,
            status: session.status,
            query:
              session.query.length > 100 ? session.query.substring(0, 100) + '...' : session.query,
            model: session.config.model,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
          });
        } catch {
          // Skip invalid session files
        }
      }

      // Sort by updatedAt descending
      return entries.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch {
      return [];
    }
  }

  /**
   * Find sessions matching criteria.
   */
  async find(criteria: {
    status?: SessionStatus;
    model?: SupportedModel;
    tags?: string[];
  }): Promise<SessionListEntry[]> {
    const all = await this.list();

    return all.filter((entry) => {
      if (criteria.status && entry.status !== criteria.status) {
        return false;
      }
      if (criteria.model && entry.model !== criteria.model) {
        return false;
      }
      // Note: tags require full session load to check
      return true;
    });
  }

  /**
   * Get sessions that can be resumed.
   */
  async getResumable(): Promise<SessionListEntry[]> {
    return this.find({ status: 'paused' });
  }

  /**
   * Clean up old completed sessions.
   *
   * @param maxAge - Maximum age in milliseconds
   */
  async cleanup(maxAge: number): Promise<number> {
    const all = await this.list();
    const cutoff = Date.now() - maxAge;
    let deleted = 0;

    for (const entry of all) {
      if (
        ['completed', 'failed'].includes(entry.status) &&
        new Date(entry.updatedAt).getTime() < cutoff
      ) {
        await this.delete(entry.id);
        deleted++;
      }
    }

    return deleted;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a session can be resumed.
 *
 * @param session - Session to check
 * @returns True if session can be resumed
 */
export function canResumeSession(session: RLMSession): boolean {
  return ['created', 'paused', 'interrupted'].includes(session.status);
}

/**
 * Get a summary of session progress.
 *
 * @param session - Session to summarize
 * @returns Progress summary
 */
export function getSessionProgress(session: RLMSession): {
  iteration: number;
  maxIterations: number;
  percentComplete: number;
  status: SessionStatus;
  tokensUsed: number;
  costSoFar: number;
} {
  const percentComplete =
    session.status === 'completed'
      ? 100
      : Math.min((session.checkpoint.iteration / session.config.maxIterations) * 100, 99);

  return {
    iteration: session.checkpoint.iteration,
    maxIterations: session.config.maxIterations,
    percentComplete: Math.round(percentComplete),
    status: session.status,
    tokensUsed: session.cost.totalTokens,
    costSoFar: session.cost.estimatedCost,
  };
}

/**
 * Export session to a portable format.
 *
 * @param session - Session to export
 * @returns Portable session JSON string
 */
export function exportSession(session: RLMSession): string {
  return JSON.stringify(session, null, 2);
}

/**
 * Import session from portable format.
 *
 * @param json - Session JSON string
 * @returns Imported session
 */
export function importSession(json: string): RLMSession {
  const session = JSON.parse(json);
  validateSession(session);
  return session;
}

/**
 * Create a session ID from query (for deterministic IDs).
 *
 * @param query - Query string
 * @param timestamp - Optional timestamp
 * @returns Deterministic session ID
 */
export function createSessionId(query: string, timestamp?: Date): string {
  // createHash imported at top of file
  const ts = (timestamp ?? new Date()).toISOString().split('T')[0];
  const hash = createHash('sha256').update(query).digest('hex').substring(0, 8);
  return `${ts}-${hash}`;
}
