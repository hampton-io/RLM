import type { TraceEntry, TraceEntryType, TraceData, Message, TokenUsage } from '../types.js';

// Re-export trace reporter
export { TraceReporter, createFileReporter, createConsoleReporter } from './trace-reporter.js';
export type { TraceReporterOptions, TraceSession } from './trace-reporter.js';

/**
 * Logger for RLM execution traces.
 */
export class RLMLogger {
  private entries: TraceEntry[] = [];
  private verbose: boolean;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  /**
   * Log an LLM call.
   */
  logLLMCall(depth: number, messages: Message[], response: string, usage: TokenUsage): void {
    this.addEntry('llm_call', depth, {
      type: 'llm_call',
      messages,
      response,
      usage,
    });

    if (this.verbose) {
      console.log(`[RLM] LLM call (depth=${depth}):`, {
        promptLength: messages.reduce((acc, m) => acc + m.content.length, 0),
        responseLength: response.length,
        tokens: usage.totalTokens,
      });
    }
  }

  /**
   * Log code execution.
   */
  logCodeExecution(
    depth: number,
    code: string,
    output: string,
    executionTime: number,
    error?: string
  ): void {
    this.addEntry('code_execution', depth, {
      type: 'code_execution',
      code,
      output,
      error,
      executionTime,
    });

    if (this.verbose) {
      console.log(`[RLM] Code execution (depth=${depth}):`, {
        codeLength: code.length,
        outputLength: output.length,
        executionTime,
        error: error ?? 'none',
      });
    }
  }

  /**
   * Log a sub-LLM call from within the sandbox.
   */
  logSubLLMCall(
    depth: number,
    prompt: string,
    contextLength: number,
    response: string,
    usage: TokenUsage
  ): void {
    this.addEntry('sub_llm_call', depth, {
      type: 'sub_llm_call',
      prompt,
      contextLength,
      response,
      usage,
    });

    if (this.verbose) {
      console.log(`[RLM] Sub-LLM call (depth=${depth}):`, {
        promptLength: prompt.length,
        contextLength,
        responseLength: response.length,
        tokens: usage.totalTokens,
      });
    }
  }

  /**
   * Log extended thinking from Claude 4.5+.
   */
  logExtendedThinking(
    depth: number,
    thinking: string,
    budgetTokens: number,
    iteration: number
  ): void {
    this.addEntry('extended_thinking', depth, {
      type: 'extended_thinking',
      thinking,
      budgetTokens,
      iteration,
    });

    if (this.verbose) {
      console.log(`[RLM] Extended thinking (iteration=${iteration}):`, {
        thinkingLength: thinking.length,
        budgetTokens,
      });
    }
  }

  /**
   * Log the final output.
   */
  logFinalOutput(
    depth: number,
    output: string,
    method: 'FINAL' | 'FINAL_VAR',
    variableName?: string
  ): void {
    this.addEntry('final_output', depth, {
      type: 'final_output',
      output,
      method,
      variableName,
    });

    if (this.verbose) {
      console.log(`[RLM] Final output (method=${method}):`, {
        outputLength: output.length,
        variableName,
      });
    }
  }

  /**
   * Log an error.
   */
  logError(depth: number, message: string, stack?: string): void {
    this.addEntry('error', depth, {
      type: 'error',
      message,
      stack,
    });

    if (this.verbose) {
      console.error(`[RLM] Error (depth=${depth}):`, message);
    }
  }

  /**
   * Add an entry to the trace.
   */
  private addEntry(type: TraceEntryType, depth: number, data: TraceData): void {
    this.entries.push({
      type,
      timestamp: Date.now(),
      depth,
      data,
    });
  }

  /**
   * Get all trace entries.
   */
  getEntries(): TraceEntry[] {
    return [...this.entries];
  }

  /**
   * Get total token usage across all LLM calls.
   */
  getTotalUsage(): TokenUsage {
    let promptTokens = 0;
    let completionTokens = 0;

    for (const entry of this.entries) {
      if (entry.data.type === 'llm_call' || entry.data.type === 'sub_llm_call') {
        promptTokens += entry.data.usage.promptTokens;
        completionTokens += entry.data.usage.completionTokens;
      }
    }

    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
  }

  /**
   * Get the number of LLM calls made.
   */
  getCallCount(): number {
    return this.entries.filter((e) => e.data.type === 'llm_call' || e.data.type === 'sub_llm_call')
      .length;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Export entries as JSONL string.
   */
  toJSONL(): string {
    return this.entries.map((e) => JSON.stringify(e)).join('\n');
  }

  /**
   * Export entries as JSON.
   */
  toJSON(): string {
    return JSON.stringify(this.entries, null, 2);
  }
}
