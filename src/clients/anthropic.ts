import Anthropic from '@anthropic-ai/sdk';
import type { Message, CompletionOptions, CompletionResult, StreamChunk, AnthropicModel } from '../types.js';
import { BaseLLMClient } from './base.js';
import type { LLMClientConfig } from './types.js';

/**
 * Anthropic client implementation.
 */
export class AnthropicClient extends BaseLLMClient {
  readonly provider = 'anthropic' as const;
  readonly model: AnthropicModel;

  private client: Anthropic;

  constructor(model: AnthropicModel, config: LLMClientConfig = {}) {
    super(config);
    this.model = model;

    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable or pass apiKey in config.');
    }

    this.client = new Anthropic({
      apiKey,
      baseURL: config.baseUrl || undefined,
      timeout: this.config.timeout,
      maxRetries: 0, // We handle retries ourselves
    });
  }

  /**
   * Generate a completion using Anthropic's messages API.
   */
  async completion(messages: Message[], options: CompletionOptions = {}): Promise<CompletionResult> {
    return this.withRetry(async () => {
      // Extract system message if present
      const systemMessage = messages.find((m) => m.role === 'system');
      const nonSystemMessages = messages.filter((m) => m.role !== 'system');

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: options.maxTokens ?? 4096,
        system: systemMessage?.content,
        messages: nonSystemMessages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        temperature: options.temperature ?? 0,
        stop_sequences: options.stopSequences,
      });

      const textContent = response.content.find((block) => block.type === 'text');
      const content = textContent?.type === 'text' ? textContent.text : '';

      return {
        content,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        finishReason: this.mapStopReason(response.stop_reason),
      };
    });
  }

  /**
   * Generate a streaming completion.
   */
  async *streamCompletion(
    messages: Message[],
    options: CompletionOptions = {}
  ): AsyncGenerator<StreamChunk, CompletionResult, unknown> {
    // Extract system message if present
    const systemMessage = messages.find((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: options.maxTokens ?? 4096,
      system: systemMessage?.content,
      messages: nonSystemMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      temperature: options.temperature ?? 0,
      stop_sequences: options.stopSequences,
    });

    let fullContent = '';
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let finishReason: CompletionResult['finishReason'] = 'unknown';

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const text = event.delta.text;
        fullContent += text;
        yield { content: text, done: false };
      }

      if (event.type === 'message_delta') {
        if (event.delta.stop_reason) {
          finishReason = this.mapStopReason(event.delta.stop_reason);
        }
      }

      if (event.type === 'message_start' && event.message.usage) {
        usage.promptTokens = event.message.usage.input_tokens;
      }

      if (event.type === 'message_delta' && event.usage) {
        usage.completionTokens = event.usage.output_tokens;
        usage.totalTokens = usage.promptTokens + usage.completionTokens;
      }
    }

    yield { content: '', done: true };

    return {
      content: fullContent,
      usage,
      finishReason,
    };
  }

  /**
   * Map Anthropic stop reason to our standard format.
   */
  private mapStopReason(
    reason: string | null
  ): CompletionResult['finishReason'] {
    switch (reason) {
      case 'end_turn':
      case 'stop_sequence':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'tool_use':
        return 'tool_calls';
      default:
        return 'unknown';
    }
  }
}
