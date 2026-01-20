import * as vm from 'node:vm';
import type { SandboxEnvironment, SandboxResult, SandboxOptions } from '../types.js';
import type { SandboxConfig, LLMQueryCallback, LLMQueryParallelCallback } from './types.js';

/**
 * Default sandbox options.
 */
const DEFAULT_OPTIONS: Required<SandboxOptions> = {
  timeout: 30000,
  memoryLimit: 128,
};

interface PendingQuery {
  id: number;
  type: 'single' | 'parallel';
  data: { prompt: string; subContext?: string } | { queries: Array<{ prompt: string; context?: string }> };
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

/**
 * VM-based sandbox implementation.
 *
 * Uses Node.js vm module for code execution with proper async support.
 * LLM queries are handled through a promise-based callback system.
 */
export class VMSandbox implements SandboxEnvironment {
  private context: vm.Context;
  private options: Required<SandboxOptions>;
  private output: string[] = [];
  private variables: Record<string, unknown> = {};
  private onLLMQuery: LLMQueryCallback;
  private onLLMQueryParallel?: LLMQueryParallelCallback;
  private pendingQueries: PendingQuery[] = [];
  private queryCounter = 0;
  private isExecuting = false;

  constructor(config: SandboxConfig) {
    this.options = { ...DEFAULT_OPTIONS, ...config.options };
    this.onLLMQuery = config.onLLMQuery;
    this.onLLMQueryParallel = config.onLLMQueryParallel;

    // Create sandbox context with safe globals
    this.context = this.createContext(config.context);
  }

  /**
   * Create a sandboxed VM context with the necessary globals.
   */
  private createContext(contextString: string): vm.Context {
    // Create the llm_query function that returns a real Promise
    const createLLMQuery = () => {
      return (prompt: string, subContext?: string): Promise<string> => {
        return new Promise((resolve, reject) => {
          const id = ++this.queryCounter;
          this.pendingQueries.push({
            id,
            type: 'single',
            data: { prompt, subContext },
            resolve: resolve as (value: unknown) => void,
            reject,
          });
        });
      };
    };

    // Create the parallel llm_query function
    const createLLMQueryParallel = () => {
      return (queries: Array<{ prompt: string; context?: string }>): Promise<string[]> => {
        return new Promise((resolve, reject) => {
          const id = ++this.queryCounter;
          this.pendingQueries.push({
            id,
            type: 'parallel',
            data: { queries },
            resolve: resolve as (value: unknown) => void,
            reject,
          });
        });
      };
    };

    const sandbox: Record<string, unknown> = {
      // The main context variable
      context: contextString,

      // Console-like output capture
      print: (...args: unknown[]) => {
        const output = args.map((a) => this.stringify(a)).join(' ');
        this.output.push(output);
      },
      console: {
        log: (...args: unknown[]) => {
          const output = args.map((a) => this.stringify(a)).join(' ');
          this.output.push(output);
        },
        error: (...args: unknown[]) => {
          const output = args.map((a) => this.stringify(a)).join(' ');
          this.output.push(`[ERROR] ${output}`);
        },
        warn: (...args: unknown[]) => {
          const output = args.map((a) => this.stringify(a)).join(' ');
          this.output.push(`[WARN] ${output}`);
        },
      },

      // LLM query functions - these return real Promises
      llm_query: createLLMQuery(),
      llm_query_parallel: createLLMQueryParallel(),

      // Helper utilities
      chunk: (text: string, size: number): string[] => {
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += size) {
          chunks.push(text.slice(i, i + size));
        }
        return chunks;
      },

      grep: (text: string, pattern: string | RegExp): string[] => {
        const regex = typeof pattern === 'string' ? new RegExp(pattern, 'gm') : pattern;
        const lines = text.split('\n');
        return lines.filter((line) => regex.test(line));
      },

      len: (text: string): number => {
        return text.length;
      },

      // Additional utilities
      slice: (text: string, start: number, end?: number): string => {
        return text.slice(start, end);
      },

      split: (text: string, separator: string | RegExp): string[] => {
        return text.split(separator);
      },

      join: (arr: string[], separator: string): string => {
        return arr.join(separator);
      },

      // Safe subset of built-ins
      Array,
      Object,
      String,
      Number,
      Boolean,
      Date,
      Math,
      JSON,
      RegExp,
      Map,
      Set,
      Promise,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      setTimeout: (fn: () => void, ms: number) => {
        // Limited setTimeout - max 5 seconds
        const safeMs = Math.min(ms, 5000);
        return setTimeout(fn, safeMs);
      },
      clearTimeout,

      // Variable storage for FINAL_VAR
      __variables__: this.variables,
      __setVar__: (name: string, value: unknown) => {
        this.variables[name] = value;
      },
    };

    return vm.createContext(sandbox);
  }

  /**
   * Execute code in the sandbox with proper async handling.
   */
  async execute(code: string): Promise<SandboxResult> {
    const startTime = Date.now();
    this.output = [];
    this.pendingQueries = [];
    this.isExecuting = true;

    try {
      // Wrap code in an async IIFE
      const wrappedCode = `
        (async () => {
          try {
            ${code}
          } catch (e) {
            console.error(e.message || e);
            throw e;
          }
        })()
      `;

      // Create and run the script
      const script = new vm.Script(wrappedCode);
      const executionPromise = script.runInContext(this.context, {
        timeout: this.options.timeout,
      });

      // Process pending queries as they come in
      await this.executeWithQueryProcessing(executionPromise);

      // Update variables from context
      this.updateVariables();

      return {
        output: this.output.join('\n'),
        variables: { ...this.variables },
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        output: this.output.join('\n'),
        error: errorMessage,
        variables: { ...this.variables },
        executionTime: Date.now() - startTime,
      };
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Execute the code promise while processing LLM queries as they occur.
   */
  private async executeWithQueryProcessing(executionPromise: Promise<unknown>): Promise<unknown> {
    // Process queries in a loop until execution completes
    const processQueries = async () => {
      while (this.isExecuting || this.pendingQueries.length > 0) {
        // Process any pending queries
        while (this.pendingQueries.length > 0) {
          const query = this.pendingQueries.shift()!;
          try {
            if (query.type === 'single') {
              const data = query.data as { prompt: string; subContext?: string };
              const result = await this.onLLMQuery(data.prompt, data.subContext);
              query.resolve(result);
            } else if (query.type === 'parallel' && this.onLLMQueryParallel) {
              const data = query.data as { queries: Array<{ prompt: string; context?: string }> };
              const results = await this.onLLMQueryParallel(data.queries);
              query.resolve(results);
            } else {
              // Fallback for parallel without handler - run sequentially
              const data = query.data as { queries: Array<{ prompt: string; context?: string }> };
              const results = await Promise.all(
                data.queries.map((q) => this.onLLMQuery(q.prompt, q.context))
              );
              query.resolve(results);
            }
          } catch (error) {
            query.reject(error instanceof Error ? error : new Error(String(error)));
          }
        }

        // Small delay to allow more queries to queue up
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    };

    // Run query processing in parallel with code execution
    const queryProcessor = processQueries();

    try {
      const result = await executionPromise;
      this.isExecuting = false;
      await queryProcessor;
      return result;
    } catch (error) {
      this.isExecuting = false;
      // Reject any remaining pending queries
      for (const query of this.pendingQueries) {
        query.reject(new Error('Execution failed'));
      }
      this.pendingQueries = [];
      throw error;
    }
  }

  /**
   * Update stored variables from context.
   */
  private updateVariables(): void {
    const vars = this.context.__variables__ as Record<string, unknown>;
    if (vars && typeof vars === 'object') {
      Object.assign(this.variables, vars);
    }
  }

  /**
   * Stringify a value for output.
   */
  private stringify(value: unknown): string {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  /**
   * Set a variable in the sandbox.
   */
  setVariable(name: string, value: unknown): void {
    this.variables[name] = value;
    this.context[name] = value;
  }

  /**
   * Get a variable from the sandbox.
   */
  getVariable(name: string): unknown {
    return this.context[name];
  }

  /**
   * Reset the sandbox state.
   */
  reset(): void {
    this.output = [];
    this.variables = {};
    this.pendingQueries = [];
    this.queryCounter = 0;
  }

  /**
   * Dispose of the sandbox.
   */
  dispose(): void {
    this.reset();
  }
}

/**
 * Create a new VM sandbox instance.
 */
export async function createVMSandbox(config: SandboxConfig): Promise<SandboxEnvironment> {
  return new VMSandbox(config);
}
