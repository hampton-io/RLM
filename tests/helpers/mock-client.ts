import type { LLMClient } from '../../src/clients/types.js';
import type { Message, CompletionOptions, CompletionResult, StreamChunk } from '../../src/types.js';

/**
 * Configuration for mock responses.
 */
export interface MockResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
  delay?: number;
  error?: Error;
}

/**
 * Mock LLM client for testing.
 */
export class MockLLMClient implements LLMClient {
  readonly provider = 'mock';
  readonly model = 'mock-model';

  private responses: MockResponse[] = [];
  private callIndex = 0;
  private callHistory: Array<{ messages: Message[]; options?: CompletionOptions }> = [];

  constructor(responses: MockResponse[] = []) {
    this.responses = responses;
  }

  /**
   * Set responses for subsequent calls.
   */
  setResponses(responses: MockResponse[]): void {
    this.responses = responses;
    this.callIndex = 0;
  }

  /**
   * Add a single response.
   */
  addResponse(response: MockResponse): void {
    this.responses.push(response);
  }

  /**
   * Get call history.
   */
  getCallHistory(): Array<{ messages: Message[]; options?: CompletionOptions }> {
    return [...this.callHistory];
  }

  /**
   * Get number of calls made.
   */
  getCallCount(): number {
    return this.callHistory.length;
  }

  /**
   * Clear call history.
   */
  clearHistory(): void {
    this.callHistory = [];
  }

  /**
   * Reset the mock client.
   */
  reset(): void {
    this.responses = [];
    this.callIndex = 0;
    this.callHistory = [];
  }

  async completion(
    messages: Message[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    this.callHistory.push({ messages, options });

    const response = this.responses[this.callIndex] ?? {
      content: `Mock response ${this.callIndex + 1}`,
      usage: { promptTokens: 100, completionTokens: 50 },
    };

    this.callIndex++;

    if (response.error) {
      throw response.error;
    }

    if (response.delay) {
      await new Promise((r) => setTimeout(r, response.delay));
    }

    return {
      content: response.content,
      usage: {
        promptTokens: response.usage?.promptTokens ?? 100,
        completionTokens: response.usage?.completionTokens ?? 50,
        totalTokens: (response.usage?.promptTokens ?? 100) + (response.usage?.completionTokens ?? 50),
      },
    };
  }

  async *streamCompletion(
    messages: Message[],
    options?: CompletionOptions
  ): AsyncGenerator<StreamChunk, CompletionResult, unknown> {
    this.callHistory.push({ messages, options });

    const response = this.responses[this.callIndex] ?? {
      content: `Mock response ${this.callIndex + 1}`,
      usage: { promptTokens: 100, completionTokens: 50 },
    };

    this.callIndex++;

    // Throw errors immediately (simulating connection failure)
    // This must happen before any yield for retry logic to work
    if (response.error) {
      throw response.error;
    }

    if (response.delay) {
      await new Promise((r) => setTimeout(r, response.delay));
    }

    // Split content into chunks
    const words = response.content.split(' ');
    for (const word of words) {
      yield {
        content: word + ' ',
        done: false,
      };
    }

    return {
      content: response.content,
      usage: {
        promptTokens: response.usage?.promptTokens ?? 100,
        completionTokens: response.usage?.completionTokens ?? 50,
        totalTokens: (response.usage?.promptTokens ?? 100) + (response.usage?.completionTokens ?? 50),
      },
    };
  }
}

/**
 * Create a mock client with predefined code generation responses.
 */
export function createCodeGeneratingMock(finalAnswer: string): MockLLMClient {
  return new MockLLMClient([
    {
      content: `Let me search the context for relevant information.

\`\`\`javascript
const lines = context.split('\\n');
print('Found ' + lines.length + ' lines');
const matches = grep(context, /important/i);
print('Matches: ' + matches.length);
\`\`\``,
      usage: { promptTokens: 200, completionTokens: 100 },
    },
    {
      content: `Based on my analysis, I found the answer.

FINAL("${finalAnswer}")`,
      usage: { promptTokens: 300, completionTokens: 50 },
    },
  ]);
}

/**
 * Create a mock client that uses llm_query for sub-queries.
 */
export function createSubQueryMock(): MockLLMClient {
  return new MockLLMClient([
    {
      content: `I need to analyze different parts of the context.

\`\`\`javascript
const part1 = await llm_query("What is in the first half?", context.slice(0, context.length / 2));
const part2 = await llm_query("What is in the second half?", context.slice(context.length / 2));
print('Part 1: ' + part1);
print('Part 2: ' + part2);
\`\`\``,
      usage: { promptTokens: 200, completionTokens: 150 },
    },
    {
      content: `Based on the sub-queries, I can now provide the answer.

FINAL("Combined analysis complete")`,
      usage: { promptTokens: 400, completionTokens: 50 },
    },
  ]);
}

/**
 * Create a mock client that loops for a specific number of iterations.
 */
export function createLoopingMock(iterations: number): MockLLMClient {
  const responses: MockResponse[] = [];

  for (let i = 0; i < iterations - 1; i++) {
    responses.push({
      content: `\`\`\`javascript
print('Iteration ${i + 1}');
\`\`\``,
      usage: { promptTokens: 100, completionTokens: 30 },
    });
  }

  responses.push({
    content: `FINAL("Completed after ${iterations} iterations")`,
    usage: { promptTokens: 100, completionTokens: 20 },
  });

  return new MockLLMClient(responses);
}

/**
 * Create a mock client that always throws an error.
 */
export function createErrorMock(error: Error): MockLLMClient {
  return new MockLLMClient([{ content: '', error }]);
}

/**
 * Create a mock client that fails N times then succeeds.
 */
export function createFlakeyMock(failCount: number, successResponse: string): MockLLMClient {
  const responses: MockResponse[] = [];

  for (let i = 0; i < failCount; i++) {
    responses.push({
      content: '',
      error: new Error('Rate limit exceeded'),
    });
  }

  responses.push({
    content: `FINAL("${successResponse}")`,
    usage: { promptTokens: 100, completionTokens: 50 },
  });

  return new MockLLMClient(responses);
}
