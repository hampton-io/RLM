import type {
  Message,
  RLMOptions,
  RLMCompletionOptions,
  RLMResult,
  SandboxEnvironment,
} from './types.js';
import type { LLMClient } from './clients/types.js';
import { createClient, calculateCost } from './clients/index.js';
import { createSandbox } from './sandbox/index.js';
import { getSystemPrompt, createUserPrompt } from './prompts/index.js';
import {
  parseLLMOutput,
  maxIterationsError,
  wrapError,
} from './utils/index.js';
import { RLMLogger } from './logger/index.js';

/**
 * Default RLM options.
 */
const DEFAULT_OPTIONS: Required<Omit<RLMOptions, 'apiKey' | 'provider' | 'extendedThinking'>> = {
  model: 'gpt-4o-mini',
  maxIterations: 20,
  maxDepth: 1,
  sandboxTimeout: 10000,
  verbose: false,
  temperature: 0,
};

/**
 * RLM Executor - orchestrates the REPL-style execution loop.
 */
export class RLMExecutor {
  private options: Required<Omit<RLMOptions, 'apiKey' | 'provider' | 'extendedThinking'>> & Pick<RLMOptions, 'apiKey' | 'provider' | 'extendedThinking'>;
  private client: LLMClient;
  private logger: RLMLogger;

  constructor(options: RLMOptions) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    this.client = createClient(this.options.model, {
      apiKey: this.options.apiKey,
      provider: this.options.provider,
    });

    this.logger = new RLMLogger(this.options.verbose);
  }

  /**
   * Execute an RLM completion.
   */
  async execute(
    query: string,
    context: string = '',
    options: RLMCompletionOptions = {}
  ): Promise<RLMResult> {
    const startTime = Date.now();
    this.logger.clear();

    // Create sandbox with context and LLM query callback
    const sandbox = await this.createSandboxWithCallbacks(context, 0);

    try {
      // Build initial messages
      const messages: Message[] = [
        { role: 'system', content: getSystemPrompt() },
        { role: 'user', content: createUserPrompt(query, context.length) },
      ];

      let iteration = 0;
      let finalAnswer: string | null = null;

      // Main execution loop
      while (iteration < this.options.maxIterations) {
        iteration++;

        // Get LLM response
        const completion = await this.client.completion(messages, {
          temperature: this.options.temperature,
          thinking: this.options.extendedThinking,
        });

        // Log extended thinking if present
        if (completion.thinking) {
          this.logger.logExtendedThinking(
            0,
            completion.thinking,
            this.options.extendedThinking?.budgetTokens ?? 1024,
            iteration
          );
          options.onStep?.(this.logger.getEntries().slice(-1)[0]);
        }

        this.logger.logLLMCall(0, messages, completion.content, completion.usage);
        options.onStep?.(this.logger.getEntries().slice(-1)[0]);

        // Parse the response
        const parsed = parseLLMOutput(completion.content);

        // Check for final answer
        if (parsed.final) {
          if (parsed.final.type === 'FINAL') {
            finalAnswer = parsed.final.value;
          } else if (parsed.final.type === 'FINAL_VAR') {
            const varValue = sandbox.getVariable(parsed.final.value);
            finalAnswer = this.stringify(varValue);
          }

          this.logger.logFinalOutput(
            0,
            finalAnswer ?? '',
            parsed.final.type,
            parsed.final.type === 'FINAL_VAR' ? parsed.final.value : undefined
          );
          break;
        }

        // If there's code to execute
        if (parsed.code) {
          const result = await sandbox.execute(parsed.code);

          this.logger.logCodeExecution(
            0,
            parsed.code,
            result.output,
            result.executionTime,
            result.error
          );
          options.onStep?.(this.logger.getEntries().slice(-1)[0]);

          // Add assistant message with the code
          messages.push({
            role: 'assistant',
            content: completion.content,
          });

          // Add execution result as user message
          const executionFeedback = this.formatExecutionResult(result.output, result.error);
          messages.push({
            role: 'user',
            content: executionFeedback,
          });
        } else {
          // No code and no final answer - the model might be thinking
          // Add the response and prompt for action
          messages.push({
            role: 'assistant',
            content: completion.content,
          });
          messages.push({
            role: 'user',
            content: 'Please write code to explore the context or provide your final answer using FINAL("answer").',
          });
        }
      }

      // Check if we got an answer
      if (finalAnswer === null) {
        throw maxIterationsError(this.options.maxIterations);
      }

      // Calculate total usage and cost
      const totalUsage = this.logger.getTotalUsage();
      const totalCost = calculateCost(this.options.model, totalUsage);

      return {
        response: finalAnswer,
        trace: this.logger.getEntries(),
        usage: {
          totalTokens: totalUsage.totalTokens,
          totalCalls: this.logger.getCallCount(),
          estimatedCost: totalCost,
        },
        executionTime: Date.now() - startTime,
      };
    } finally {
      sandbox.dispose();
    }
  }

  /**
   * Create a sandbox with LLM query callbacks wired up.
   */
  private async createSandboxWithCallbacks(
    context: string,
    depth: number
  ): Promise<SandboxEnvironment> {
    return createSandbox('vm', {
      context,
      options: {
        timeout: this.options.sandboxTimeout,
      },
      onLLMQuery: async (prompt: string, subContext?: string) => {
        return this.handleSubQuery(prompt, subContext ?? context, depth + 1);
      },
      onLLMQueryParallel: async (queries) => {
        const results = await Promise.all(
          queries.map((q) =>
            this.handleSubQuery(q.prompt, q.context ?? context, depth + 1)
          )
        );
        return results;
      },
    });
  }

  /**
   * Handle a sub-LLM query from within the sandbox.
   */
  private async handleSubQuery(
    prompt: string,
    subContext: string,
    depth: number
  ): Promise<string> {
    if (depth > this.options.maxDepth) {
      return `[Error: Maximum recursion depth (${this.options.maxDepth}) exceeded]`;
    }

    try {
      // For sub-queries, we use a simpler prompt structure
      const messages: Message[] = [
        {
          role: 'system',
          content: 'You are a helpful assistant. Answer the question based on the provided context. Be concise and direct.',
        },
        {
          role: 'user',
          content: `Context:\n${subContext}\n\nQuestion: ${prompt}`,
        },
      ];

      const completion = await this.client.completion(messages, {
        temperature: this.options.temperature,
      });

      this.logger.logSubLLMCall(
        depth,
        prompt,
        subContext.length,
        completion.content,
        completion.usage
      );

      return completion.content;
    } catch (error) {
      const wrapped = wrapError(error);
      this.logger.logError(depth, wrapped.message, wrapped.stack);
      return `[Error: ${wrapped.message}]`;
    }
  }

  /**
   * Format execution result for feedback to the LLM.
   */
  private formatExecutionResult(output: string, error?: string): string {
    let feedback = '';

    if (output) {
      feedback += `Output:\n${output}\n`;
    }

    if (error) {
      feedback += `Error:\n${error}\n`;
    }

    if (!output && !error) {
      feedback = 'Code executed successfully with no output.';
    }

    return feedback;
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
}
