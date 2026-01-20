import type { SandboxOptions, SandboxResult, SandboxEnvironment } from '../types.js';

export type { SandboxOptions, SandboxResult, SandboxEnvironment };

/**
 * Function signature for the llm_query callback.
 * This is called from within the sandbox to make sub-LLM calls.
 */
export type LLMQueryCallback = (prompt: string, subContext?: string) => Promise<string>;

/**
 * Function signature for parallel llm_query callback.
 */
export type LLMQueryParallelCallback = (
  queries: Array<{ prompt: string; context?: string }>
) => Promise<string[]>;

/**
 * Configuration for creating a sandbox.
 */
export interface SandboxConfig {
  /** The full context string to be accessible as `context` variable */
  context: string;

  /** Callback for llm_query function */
  onLLMQuery: LLMQueryCallback;

  /** Callback for parallel llm_query function */
  onLLMQueryParallel?: LLMQueryParallelCallback;

  /** Sandbox options */
  options?: SandboxOptions;
}

/**
 * Factory function type for creating sandboxes.
 */
export type SandboxFactory = (config: SandboxConfig) => Promise<SandboxEnvironment>;
