import { writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TraceEntry, TokenUsage } from '../types.js';

/**
 * Options for trace reporting.
 */
export interface TraceReporterOptions {
  /** Output file path for JSONL traces */
  outputPath?: string;
  /** Whether to auto-flush after each entry */
  autoFlush?: boolean;
  /** Include timestamps in console output */
  showTimestamps?: boolean;
  /** Colorize console output */
  colorize?: boolean;
  /** Session ID for correlation */
  sessionId?: string;
}

/**
 * Session metadata for trace files.
 */
export interface TraceSession {
  sessionId: string;
  startTime: number;
  model: string;
  query: string;
  contextLength: number;
  options?: Record<string, unknown>;
}

/**
 * ANSI color codes for terminal output.
 */
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

/**
 * Enhanced trace reporter for RLM execution.
 *
 * Supports:
 * - JSONL file output (compatible with original RLM visualizer)
 * - Terminal-formatted output
 * - Session tracking
 * - Statistics computation
 */
export class TraceReporter {
  private options: Required<TraceReporterOptions>;
  private entries: TraceEntry[] = [];
  private sessionId: string;
  private startTime: number;
  private fileInitialized = false;

  constructor(options: TraceReporterOptions = {}) {
    this.options = {
      outputPath: options.outputPath ?? '',
      autoFlush: options.autoFlush ?? true,
      showTimestamps: options.showTimestamps ?? true,
      colorize: options.colorize ?? true,
      sessionId: options.sessionId ?? this.generateSessionId(),
    };
    this.sessionId = this.options.sessionId;
    this.startTime = Date.now();
  }

  /**
   * Generate a unique session ID.
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `rlm_${timestamp}_${random}`;
  }

  /**
   * Get the session ID.
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Initialize the trace file with session metadata.
   */
  initSession(session: Omit<TraceSession, 'sessionId' | 'startTime'>): void {
    const fullSession: TraceSession = {
      ...session,
      sessionId: this.sessionId,
      startTime: this.startTime,
    };

    if (this.options.outputPath) {
      this.ensureDirectory(this.options.outputPath);
      writeFileSync(
        this.options.outputPath,
        JSON.stringify({ type: 'session_start', ...fullSession }) + '\n'
      );
      this.fileInitialized = true;
    }
  }

  /**
   * Add a trace entry.
   */
  addEntry(entry: TraceEntry): void {
    const enrichedEntry = {
      ...entry,
      sessionId: this.sessionId,
      relativeTime: entry.timestamp - this.startTime,
    };

    this.entries.push(entry);

    if (this.options.outputPath && this.options.autoFlush) {
      this.ensureDirectory(this.options.outputPath);
      appendFileSync(this.options.outputPath, JSON.stringify(enrichedEntry) + '\n');
      this.fileInitialized = true;
    }
  }

  /**
   * Add multiple entries from a logger.
   */
  addEntries(entries: TraceEntry[]): void {
    for (const entry of entries) {
      this.addEntry(entry);
    }
  }

  /**
   * Ensure the directory exists for the output file.
   */
  private ensureDirectory(filePath: string): void {
    const dir = dirname(filePath);
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Flush all entries to the output file.
   */
  flush(): void {
    if (!this.options.outputPath || this.fileInitialized) return;

    this.ensureDirectory(this.options.outputPath);
    const content = this.entries
      .map((e) => JSON.stringify({ ...e, sessionId: this.sessionId }))
      .join('\n');
    writeFileSync(this.options.outputPath, content + '\n');
    this.fileInitialized = true;
  }

  /**
   * Finalize the session and write summary.
   */
  finalize(result?: {
    response: string;
    usage: { totalTokens: number; estimatedCost: number };
  }): void {
    const endTime = Date.now();
    const summary = {
      type: 'session_end',
      sessionId: this.sessionId,
      endTime,
      duration: endTime - this.startTime,
      totalEntries: this.entries.length,
      ...this.getStatistics(),
      result: result
        ? {
            responseLength: result.response.length,
            totalTokens: result.usage.totalTokens,
            estimatedCost: result.usage.estimatedCost,
          }
        : undefined,
    };

    if (this.options.outputPath) {
      appendFileSync(this.options.outputPath, JSON.stringify(summary) + '\n');
    }
  }

  /**
   * Get execution statistics.
   */
  getStatistics(): {
    llmCalls: number;
    subLlmCalls: number;
    codeExecutions: number;
    errors: number;
    totalTokens: TokenUsage;
    totalExecutionTime: number;
  } {
    let llmCalls = 0;
    let subLlmCalls = 0;
    let codeExecutions = 0;
    let errors = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let totalExecutionTime = 0;

    for (const entry of this.entries) {
      switch (entry.data.type) {
        case 'llm_call':
          llmCalls++;
          promptTokens += entry.data.usage.promptTokens;
          completionTokens += entry.data.usage.completionTokens;
          break;
        case 'sub_llm_call':
          subLlmCalls++;
          promptTokens += entry.data.usage.promptTokens;
          completionTokens += entry.data.usage.completionTokens;
          break;
        case 'code_execution':
          codeExecutions++;
          totalExecutionTime += entry.data.executionTime;
          break;
        case 'error':
          errors++;
          break;
      }
    }

    return {
      llmCalls,
      subLlmCalls,
      codeExecutions,
      errors,
      totalTokens: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      totalExecutionTime,
    };
  }

  /**
   * Format a trace entry for terminal display.
   */
  formatEntry(entry: TraceEntry): string {
    const c = this.options.colorize
      ? COLORS
      : {
          reset: '',
          bright: '',
          dim: '',
          red: '',
          green: '',
          yellow: '',
          blue: '',
          magenta: '',
          cyan: '',
          white: '',
          gray: '',
        };
    const timestamp = this.options.showTimestamps
      ? `${c.gray}[${new Date(entry.timestamp).toISOString()}]${c.reset} `
      : '';
    const depth = entry.depth > 0 ? `${c.dim}${'  '.repeat(entry.depth)}${c.reset}` : '';

    switch (entry.data.type) {
      case 'llm_call':
        return `${timestamp}${depth}${c.blue}[LLM]${c.reset} ${c.bright}Call${c.reset} - ${entry.data.usage.totalTokens} tokens`;

      case 'sub_llm_call':
        return `${timestamp}${depth}${c.magenta}[SUB-LLM]${c.reset} Query: "${this.truncate(entry.data.prompt, 50)}" - ${entry.data.usage.totalTokens} tokens`;

      case 'code_execution': {
        const status = entry.data.error ? `${c.red}ERROR${c.reset}` : `${c.green}OK${c.reset}`;
        return `${timestamp}${depth}${c.cyan}[CODE]${c.reset} ${status} (${entry.data.executionTime}ms) - ${this.truncate(entry.data.code, 60)}`;
      }

      case 'final_output':
        return `${timestamp}${depth}${c.green}[FINAL]${c.reset} ${c.bright}${entry.data.method}${c.reset}: "${this.truncate(entry.data.output, 80)}"`;

      case 'error':
        return `${timestamp}${depth}${c.red}[ERROR]${c.reset} ${entry.data.message}`;

      default:
        return `${timestamp}${depth}[UNKNOWN] ${JSON.stringify(entry.data)}`;
    }
  }

  /**
   * Truncate a string for display.
   */
  private truncate(str: string, maxLength: number): string {
    const cleaned = str.replace(/\n/g, '\\n').replace(/\t/g, '\\t');
    if (cleaned.length <= maxLength) return cleaned;
    return cleaned.substring(0, maxLength - 3) + '...';
  }

  /**
   * Print all entries to console.
   */
  printAll(): void {
    for (const entry of this.entries) {
      console.log(this.formatEntry(entry));
    }
  }

  /**
   * Print a summary to console.
   */
  printSummary(): void {
    const c = this.options.colorize
      ? COLORS
      : {
          reset: '',
          bright: '',
          dim: '',
          red: '',
          green: '',
          yellow: '',
          blue: '',
          magenta: '',
          cyan: '',
          white: '',
          gray: '',
        };
    const stats = this.getStatistics();

    console.log(`\n${c.bright}=== RLM Execution Summary ===${c.reset}`);
    console.log(`${c.gray}Session: ${this.sessionId}${c.reset}`);
    console.log(`${c.gray}Duration: ${Date.now() - this.startTime}ms${c.reset}\n`);

    console.log(`${c.blue}LLM Calls:${c.reset}       ${stats.llmCalls}`);
    console.log(`${c.magenta}Sub-LLM Calls:${c.reset}   ${stats.subLlmCalls}`);
    console.log(`${c.cyan}Code Executions:${c.reset} ${stats.codeExecutions}`);
    if (stats.errors > 0) {
      console.log(`${c.red}Errors:${c.reset}          ${stats.errors}`);
    }

    console.log(`\n${c.bright}Token Usage:${c.reset}`);
    console.log(`  Prompt:     ${stats.totalTokens.promptTokens.toLocaleString()}`);
    console.log(`  Completion: ${stats.totalTokens.completionTokens.toLocaleString()}`);
    console.log(`  Total:      ${stats.totalTokens.totalTokens.toLocaleString()}`);

    if (stats.totalExecutionTime > 0) {
      console.log(`\n${c.bright}Code Execution Time:${c.reset} ${stats.totalExecutionTime}ms`);
    }
  }

  /**
   * Generate a detailed report as a string.
   */
  generateReport(): string {
    const stats = this.getStatistics();
    const lines: string[] = [];

    lines.push('='.repeat(60));
    lines.push('RLM EXECUTION REPORT');
    lines.push('='.repeat(60));
    lines.push(`Session ID: ${this.sessionId}`);
    lines.push(`Started: ${new Date(this.startTime).toISOString()}`);
    lines.push(`Duration: ${Date.now() - this.startTime}ms`);
    lines.push('');

    lines.push('-'.repeat(60));
    lines.push('STATISTICS');
    lines.push('-'.repeat(60));
    lines.push(`LLM Calls:        ${stats.llmCalls}`);
    lines.push(`Sub-LLM Calls:    ${stats.subLlmCalls}`);
    lines.push(`Code Executions:  ${stats.codeExecutions}`);
    lines.push(`Errors:           ${stats.errors}`);
    lines.push('');

    lines.push('-'.repeat(60));
    lines.push('TOKEN USAGE');
    lines.push('-'.repeat(60));
    lines.push(`Prompt Tokens:     ${stats.totalTokens.promptTokens.toLocaleString()}`);
    lines.push(`Completion Tokens: ${stats.totalTokens.completionTokens.toLocaleString()}`);
    lines.push(`Total Tokens:      ${stats.totalTokens.totalTokens.toLocaleString()}`);
    lines.push('');

    lines.push('-'.repeat(60));
    lines.push('EXECUTION TIMELINE');
    lines.push('-'.repeat(60));
    for (const entry of this.entries) {
      const relTime = entry.timestamp - this.startTime;
      const depth = '  '.repeat(entry.depth);
      const type = entry.data.type.toUpperCase().padEnd(15);
      lines.push(`+${relTime.toString().padStart(6)}ms ${depth}${type}`);
    }
    lines.push('');

    lines.push('='.repeat(60));

    return lines.join('\n');
  }

  /**
   * Export to JSONL format.
   */
  toJSONL(): string {
    return this.entries.map((e) => JSON.stringify({ ...e, sessionId: this.sessionId })).join('\n');
  }

  /**
   * Export to JSON format.
   */
  toJSON(): string {
    return JSON.stringify(
      {
        sessionId: this.sessionId,
        startTime: this.startTime,
        duration: Date.now() - this.startTime,
        statistics: this.getStatistics(),
        entries: this.entries,
      },
      null,
      2
    );
  }

  /**
   * Get all entries.
   */
  getEntries(): TraceEntry[] {
    return [...this.entries];
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.entries = [];
  }
}

/**
 * Create a trace reporter with file output.
 */
export function createFileReporter(
  outputPath: string,
  options?: Omit<TraceReporterOptions, 'outputPath'>
): TraceReporter {
  return new TraceReporter({ ...options, outputPath });
}

/**
 * Create a console-only trace reporter.
 */
export function createConsoleReporter(
  options?: Omit<TraceReporterOptions, 'outputPath'>
): TraceReporter {
  return new TraceReporter(options);
}
