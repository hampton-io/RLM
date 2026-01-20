import { GoogleGenAI } from '@google/genai';
import type { Message, CompletionOptions, CompletionResult, StreamChunk, GoogleModel } from '../types.js';
import { BaseLLMClient } from './base.js';
import type { LLMClientConfig } from './types.js';

/**
 * Google Gemini client implementation.
 */
export class GoogleClient extends BaseLLMClient {
  readonly provider = 'google' as const;
  readonly model: GoogleModel;

  private client: GoogleGenAI;

  constructor(model: GoogleModel, config: LLMClientConfig = {}) {
    super(config);
    this.model = model;

    const apiKey = config.apiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Google API key is required. Set GOOGLE_API_KEY or GEMINI_API_KEY environment variable or pass apiKey in config.');
    }

    this.client = new GoogleGenAI({ apiKey });
  }

  /**
   * Generate a completion using Google's Gemini API.
   */
  async completion(messages: Message[], options: CompletionOptions = {}): Promise<CompletionResult> {
    return this.withRetry(async () => {
      // Extract system message if present
      const systemMessage = messages.find((m) => m.role === 'system');
      const nonSystemMessages = messages.filter((m) => m.role !== 'system');

      // Convert messages to Gemini format
      const contents = this.convertMessages(nonSystemMessages);

      const response = await this.client.models.generateContent({
        model: this.model,
        contents,
        config: {
          systemInstruction: systemMessage?.content,
          maxOutputTokens: options.maxTokens,
          temperature: options.temperature ?? 0,
          stopSequences: options.stopSequences,
        },
      });

      // Extract text from response
      const text = response.text ?? '';

      // Extract usage information
      const usageMetadata = response.usageMetadata;
      const usage = {
        promptTokens: usageMetadata?.promptTokenCount ?? 0,
        completionTokens: usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: usageMetadata?.totalTokenCount ?? 0,
      };

      return {
        content: text,
        usage,
        finishReason: this.mapFinishReason(response.candidates?.[0]?.finishReason),
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

    // Convert messages to Gemini format
    const contents = this.convertMessages(nonSystemMessages);

    const stream = await this.client.models.generateContentStream({
      model: this.model,
      contents,
      config: {
        systemInstruction: systemMessage?.content,
        maxOutputTokens: options.maxTokens,
        temperature: options.temperature ?? 0,
        stopSequences: options.stopSequences,
      },
    });

    let fullContent = '';
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let finishReason: CompletionResult['finishReason'] = 'unknown';

    for await (const chunk of stream) {
      const text = chunk.text ?? '';
      if (text) {
        fullContent += text;
        yield { content: text, done: false };
      }

      // Update usage if available
      if (chunk.usageMetadata) {
        usage = {
          promptTokens: chunk.usageMetadata.promptTokenCount ?? 0,
          completionTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
          totalTokens: chunk.usageMetadata.totalTokenCount ?? 0,
        };
      }

      // Check for finish reason
      if (chunk.candidates?.[0]?.finishReason) {
        finishReason = this.mapFinishReason(chunk.candidates[0].finishReason);
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
   * Convert messages to Gemini format.
   * Gemini uses 'user' and 'model' roles, not 'assistant'.
   */
  private convertMessages(messages: Message[]): string | Array<{ role: string; parts: Array<{ text: string }> }> {
    // If there's only one user message, we can use a simple string
    if (messages.length === 1 && messages[0].role === 'user') {
      return messages[0].content;
    }

    // Otherwise, convert to Gemini's multi-turn format
    return messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  }

  /**
   * Map Gemini finish reason to our standard format.
   */
  private mapFinishReason(
    reason: string | null | undefined
  ): CompletionResult['finishReason'] {
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
      case 'RECITATION':
      case 'BLOCKLIST':
        return 'content_filter';
      default:
        return 'unknown';
    }
  }
}
