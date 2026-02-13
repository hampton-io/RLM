import OpenAI from 'openai';
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import type {
  Message,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  OpenAIModel,
  MessageContent,
} from '../types.js';
import { isMultimodalContent, isImageContent } from '../types.js';
import { BaseLLMClient } from './base.js';
import type { LLMClientConfig } from './types.js';

/**
 * Check if a model is a reasoning model that doesn't support temperature.
 * Reasoning models (o-series, gpt-5.x) use internal reasoning and don't accept temperature.
 */
function isReasoningModel(model: string): boolean {
  // o-series models (o1, o3, o4)
  if (model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) {
    return true;
  }
  // GPT-5.x models (gpt-5, gpt-5.1, gpt-5.2, gpt-5-mini, gpt-5-nano, gpt-5-pro)
  if (model.startsWith('gpt-5')) {
    return true;
  }
  return false;
}

/**
 * OpenAI client implementation.
 */
export class OpenAIClient extends BaseLLMClient {
  readonly provider = 'openai' as const;
  readonly model: OpenAIModel;

  private client: OpenAI;

  constructor(model: OpenAIModel, config: LLMClientConfig = {}) {
    super(config);
    this.model = model;

    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass apiKey in config.');
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: config.baseUrl || undefined,
      timeout: this.config.timeout,
      maxRetries: 0, // We handle retries ourselves
    });
  }

  /**
   * Convert our MessageContent to OpenAI's content format.
   */
  private convertContent(content: MessageContent): string | ChatCompletionContentPart[] {
    if (!isMultimodalContent(content)) {
      return content;
    }

    return content.map((part): ChatCompletionContentPart => {
      if (isImageContent(part)) {
        // Convert our ImageContent to OpenAI's image_url format
        const imageUrl = part.source.type === 'url'
          ? part.source.url!
          : `data:${part.source.mediaType};base64,${part.source.data}`;

        return {
          type: 'image_url',
          image_url: {
            url: imageUrl,
            detail: part.detail ?? 'auto',
          },
        };
      } else {
        return {
          type: 'text',
          text: part.text,
        };
      }
    });
  }

  /**
   * Convert our Message array to OpenAI's message format.
   */
  private convertMessages(messages: Message[]): ChatCompletionMessageParam[] {
    return messages.map((m): ChatCompletionMessageParam => {
      const content = this.convertContent(m.content);

      switch (m.role) {
        case 'system':
          // System messages only support string content
          return {
            role: 'system',
            content: typeof content === 'string' ? content : content.map(p => p.type === 'text' ? p.text : '').join('\n'),
          };
        case 'user':
          return {
            role: 'user',
            content,
          };
        case 'assistant':
          // Assistant messages only support string content
          return {
            role: 'assistant',
            content: typeof content === 'string' ? content : content.map(p => p.type === 'text' ? p.text : '').join('\n'),
          };
      }
    });
  }

  /**
   * Generate a completion using OpenAI's chat API.
   */
  async completion(messages: Message[], options: CompletionOptions = {}): Promise<CompletionResult> {
    return this.withRetry(async () => {
      // Build request params - reasoning models don't support temperature
      const requestParams: Parameters<typeof this.client.chat.completions.create>[0] = {
        model: this.model,
        messages: this.convertMessages(messages),
        max_tokens: options.maxTokens,
        stop: options.stopSequences,
      };
      
      // Only include temperature for non-reasoning models
      if (!isReasoningModel(this.model)) {
        requestParams.temperature = options.temperature ?? 0;
      }

      const response = await this.client.chat.completions.create(requestParams);

      const choice = response.choices[0];
      if (!choice) {
        throw new Error('No completion choice returned from OpenAI');
      }

      return {
        content: choice.message.content ?? '',
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
        },
        finishReason: this.mapFinishReason(choice.finish_reason),
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
    // Build request params - reasoning models don't support temperature
    const requestParams: Parameters<typeof this.client.chat.completions.create>[0] = {
      model: this.model,
      messages: this.convertMessages(messages),
      max_tokens: options.maxTokens,
      stop: options.stopSequences,
      stream: true,
      stream_options: { include_usage: true },
    };
    
    // Only include temperature for non-reasoning models
    if (!isReasoningModel(this.model)) {
      requestParams.temperature = options.temperature ?? 0;
    }

    const stream = await this.client.chat.completions.create(requestParams);

    let fullContent = '';
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let finishReason: CompletionResult['finishReason'] = 'unknown';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullContent += delta;
        yield { content: delta, done: false };
      }

      if (chunk.choices[0]?.finish_reason) {
        finishReason = this.mapFinishReason(chunk.choices[0].finish_reason);
      }

      if (chunk.usage) {
        usage = {
          promptTokens: chunk.usage.prompt_tokens,
          completionTokens: chunk.usage.completion_tokens,
          totalTokens: chunk.usage.total_tokens,
        };
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
   * Map OpenAI finish reason to our standard format.
   */
  private mapFinishReason(
    reason: string | null
  ): CompletionResult['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
      case 'function_call':
        return 'tool_calls';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'unknown';
    }
  }
}
