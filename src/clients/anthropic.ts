import Anthropic from '@anthropic-ai/sdk';
import type {
  Message as AnthropicMessage,
  ContentBlockParam,
  TextBlockParam,
  ImageBlockParam,
} from '@anthropic-ai/sdk/resources/messages';
import type {
  Message,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  AnthropicModel,
  MessageContent,
} from '../types.js';
import { isMultimodalContent, isImageContent, getTextFromContent } from '../types.js';
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
   * Convert our MessageContent to Anthropic's content format.
   */
  private convertContent(content: MessageContent): string | ContentBlockParam[] {
    if (!isMultimodalContent(content)) {
      return content;
    }

    return content.map((part): ContentBlockParam => {
      if (isImageContent(part)) {
        // Convert our ImageContent to Anthropic's image block format
        if (part.source.type === 'url') {
          return {
            type: 'image',
            source: {
              type: 'url',
              url: part.source.url!,
            },
          } as ImageBlockParam;
        } else {
          return {
            type: 'image',
            source: {
              type: 'base64',
              media_type: part.source.mediaType,
              data: part.source.data!,
            },
          } as ImageBlockParam;
        }
      } else {
        return {
          type: 'text',
          text: part.text,
        } as TextBlockParam;
      }
    });
  }

  /**
   * Convert system message content to Anthropic's system format.
   * System messages can only contain text in Anthropic.
   */
  private convertSystemContent(content: MessageContent): string | TextBlockParam[] {
    if (!isMultimodalContent(content)) {
      return content;
    }
    // For system messages, extract only text content
    const text = getTextFromContent(content);
    return text;
  }

  /**
   * Generate a completion using Anthropic's messages API.
   */
  async completion(messages: Message[], options: CompletionOptions = {}): Promise<CompletionResult> {
    return this.withRetry(async () => {
      // Extract system message if present
      const systemMessage = messages.find((m) => m.role === 'system');
      const nonSystemMessages = messages.filter((m) => m.role !== 'system');

      // Build request parameters
      const requestParams: Parameters<typeof this.client.messages.create>[0] = {
        model: this.model,
        max_tokens: options.maxTokens ?? 4096,
        system: systemMessage ? this.convertSystemContent(systemMessage.content) : undefined,
        messages: nonSystemMessages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: this.convertContent(m.content),
        })),
        temperature: options.temperature ?? 0,
        stop_sequences: options.stopSequences,
      };

      // Add extended thinking if enabled (Claude 4.5+ only)
      if (options.thinking?.enabled && this.supportsExtendedThinking()) {
        (requestParams as unknown as Record<string, unknown>).thinking = {
          type: 'enabled',
          budget_tokens: options.thinking.budgetTokens ?? 1024,
        };
      }

      const response = await this.client.messages.create(requestParams) as AnthropicMessage;

      // Extract text and thinking content from response
      let content = '';
      let thinking: string | undefined;

      for (const block of response.content) {
        if (block.type === 'text') {
          content = block.text;
        } else if ((block as { type: string }).type === 'thinking') {
          // Extended thinking block
          thinking = (block as { type: 'thinking'; thinking: string }).thinking;
        }
      }

      return {
        content,
        thinking,
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
   * Check if the model supports extended thinking.
   * Extended thinking is available on Claude 4.5+ models.
   */
  private supportsExtendedThinking(): boolean {
    return (
      this.model.includes('claude-sonnet-4-5') ||
      this.model.includes('claude-haiku-4-5') ||
      this.model.includes('claude-opus-4-5')
    );
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

    // Build stream parameters
    const streamParams: Parameters<typeof this.client.messages.stream>[0] = {
      model: this.model,
      max_tokens: options.maxTokens ?? 4096,
      system: systemMessage ? this.convertSystemContent(systemMessage.content) : undefined,
      messages: nonSystemMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: this.convertContent(m.content),
      })),
      temperature: options.temperature ?? 0,
      stop_sequences: options.stopSequences,
    };

    // Add extended thinking if enabled (Claude 4.5+ only)
    if (options.thinking?.enabled && this.supportsExtendedThinking()) {
      (streamParams as unknown as Record<string, unknown>).thinking = {
        type: 'enabled',
        budget_tokens: options.thinking.budgetTokens ?? 1024,
      };
    }

    const stream = this.client.messages.stream(streamParams);

    let fullContent = '';
    let fullThinking = '';
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let finishReason: CompletionResult['finishReason'] = 'unknown';

    for await (const event of stream) {
      // Handle deltas based on block type
      if (event.type === 'content_block_delta') {
        const delta = event.delta as { type: string; text?: string; thinking?: string };

        if (delta.type === 'text_delta' && delta.text) {
          fullContent += delta.text;
          yield { content: delta.text, done: false, type: 'text' };
        } else if (delta.type === 'thinking_delta' && delta.thinking) {
          fullThinking += delta.thinking;
          yield { content: delta.thinking, done: false, type: 'thinking' };
        }
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
      thinking: fullThinking || undefined,
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
