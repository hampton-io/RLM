import type { SupportedModel, ModelProvider, OpenAIModel, AnthropicModel, GoogleModel } from '../types.js';
import type { LLMClient, LLMClientConfig } from './types.js';
import { detectProvider } from './types.js';
import { OpenAIClient } from './openai.js';
import { AnthropicClient } from './anthropic.js';
import { GoogleClient } from './google.js';

export type { LLMClient, LLMClientConfig, TokenCount } from './types.js';
export { OpenAIClient } from './openai.js';
export { AnthropicClient } from './anthropic.js';
export { GoogleClient } from './google.js';
export { calculateCost, detectProvider, MODEL_PRICING } from './types.js';
export { ResilientClient, createResilientClient, withLLMRetry } from './resilient-client.js';
export type { ResilientClientOptions } from './resilient-client.js';

// OpenAI Responses API exports
export {
  OpenAIResponsesClient,
  createResponsesClient,
  supportsResponsesAPI,
  extractCitationUrls,
  extractCitationFileIds,
  formatCitationsAsFootnotes,
  webSearchTool,
  fileSearchTool,
} from './openai-responses.js';
export type {
  ResponsesModel,
  WebSearchTool,
  FileSearchTool,
  CodeInterpreterTool,
  FunctionTool,
  ResponsesTool,
  ResponsesInputMessage,
  UrlCitation,
  FileCitation,
  Citation,
  TextOutputContent,
  WebSearchCallOutput,
  FileSearchCallOutput,
  MessageOutput,
  OutputItem,
  ResponsesResult,
  ResponsesOptions,
  ResponsesStreamEvent,
} from './openai-responses.js';

/**
 * Create an LLM client for the specified model.
 * Automatically detects the provider from the model name.
 */
export function createClient(
  model: SupportedModel,
  config: LLMClientConfig & { provider?: ModelProvider } = {}
): LLMClient {
  const provider = config.provider ?? detectProvider(model);

  switch (provider) {
    case 'openai':
      return new OpenAIClient(model as OpenAIModel, config);
    case 'anthropic':
      return new AnthropicClient(model as AnthropicModel, config);
    case 'google':
      return new GoogleClient(model as GoogleModel, config);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
