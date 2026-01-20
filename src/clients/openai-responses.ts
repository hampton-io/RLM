/**
 * OpenAI Responses API client implementation.
 *
 * The Responses API provides built-in tools like web search and file search,
 * simplifying agent development by automatically executing tool calls.
 *
 * @see https://platform.openai.com/docs/api-reference/responses
 */

import OpenAI from 'openai';
import type { LLMClientConfig } from './types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Models that support the Responses API.
 */
export type ResponsesModel =
  | 'gpt-5'
  | 'gpt-5-mini'
  | 'gpt-5.1'
  | 'gpt-5.2'
  | 'gpt-4.1'
  | 'gpt-4.1-mini'
  | 'gpt-4.1-nano'
  | 'gpt-4o'
  | 'gpt-4o-mini';

/**
 * Web search tool configuration.
 */
export interface WebSearchTool {
  type: 'web_search';
  /** Optional search context to guide the search */
  search_context_size?: 'low' | 'medium' | 'high';
}

/**
 * File search tool configuration.
 */
export interface FileSearchTool {
  type: 'file_search';
  /** Vector store IDs to search */
  vector_store_ids: string[];
  /** Maximum number of results to retrieve (default: 10) */
  max_num_results?: number;
  /** Filter by file attributes */
  filters?: Record<string, unknown>;
}

/**
 * Code interpreter tool configuration.
 */
export interface CodeInterpreterTool {
  type: 'code_interpreter';
  /** Container configuration for code execution */
  container?: {
    image?: string;
    files?: string[];
  };
}

/**
 * Custom function tool configuration.
 */
export interface FunctionTool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Supported tool types.
 */
export type ResponsesTool = WebSearchTool | FileSearchTool | CodeInterpreterTool | FunctionTool;

/**
 * Input message for the Responses API.
 */
export interface ResponsesInputMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * URL citation annotation.
 */
export interface UrlCitation {
  type: 'url_citation';
  /** Start index in the text */
  start_index: number;
  /** End index in the text */
  end_index: number;
  /** The cited URL */
  url: string;
  /** Title of the cited page */
  title?: string;
}

/**
 * File citation annotation.
 */
export interface FileCitation {
  type: 'file_citation';
  /** Index in the text where citation appears */
  index: number;
  /** File ID of the cited file */
  file_id: string;
  /** Filename of the cited file */
  filename: string;
  /** Quote from the file (if available) */
  quote?: string;
}

/**
 * Citation annotation types.
 */
export type Citation = UrlCitation | FileCitation;

/**
 * Text output content.
 */
export interface TextOutputContent {
  type: 'output_text';
  text: string;
  annotations?: Citation[];
}

/**
 * Web search call output.
 */
export interface WebSearchCallOutput {
  type: 'web_search_call';
  id: string;
  status: 'completed' | 'in_progress' | 'failed';
  /** Search results (may be null if not included) */
  search_results?: Array<{
    url: string;
    title: string;
    snippet: string;
  }> | null;
}

/**
 * File search call output.
 */
export interface FileSearchCallOutput {
  type: 'file_search_call';
  id: string;
  status: 'completed' | 'in_progress' | 'failed';
  queries: string[];
  /** Search results (may be null if not included) */
  search_results?: Array<{
    file_id: string;
    filename: string;
    score: number;
    content: string;
  }> | null;
}

/**
 * Message output.
 */
export interface MessageOutput {
  type: 'message';
  id: string;
  role: 'assistant';
  content: TextOutputContent[];
}

/**
 * Output item types.
 */
export type OutputItem = WebSearchCallOutput | FileSearchCallOutput | MessageOutput;

/**
 * Complete response from the Responses API.
 */
export interface ResponsesResult {
  /** Unique response ID */
  id: string;
  /** Model used */
  model: string;
  /** Output items (tool calls and messages) */
  output: OutputItem[];
  /** Convenience accessor for the final text output */
  output_text: string;
  /** Token usage */
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  /** All citations extracted from the response */
  citations: Citation[];
}

/**
 * Options for creating a response.
 */
export interface ResponsesOptions {
  /** Tools to enable */
  tools?: ResponsesTool[];
  /** Temperature for generation (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  max_output_tokens?: number;
  /** Instructions/system prompt */
  instructions?: string;
  /** Previous response ID for conversation continuity */
  previous_response_id?: string;
  /** Whether to stream the response */
  stream?: boolean;
  /** Include search results in output */
  include_search_results?: boolean;
}

/**
 * Streaming event types.
 */
export type ResponsesStreamEvent =
  | { type: 'response.created'; response: { id: string; model: string } }
  | { type: 'response.output_item.added'; item: OutputItem }
  | { type: 'response.output_text.delta'; delta: string; item_id: string }
  | { type: 'response.output_text.done'; text: string; item_id: string }
  | { type: 'response.web_search.searching'; query: string }
  | { type: 'response.web_search.completed'; results_count: number }
  | { type: 'response.file_search.searching'; queries: string[] }
  | { type: 'response.file_search.completed'; results_count: number }
  | { type: 'response.completed'; response: ResponsesResult }
  | { type: 'response.failed'; error: { message: string; code?: string } };

// =============================================================================
// Client Implementation
// =============================================================================

/**
 * OpenAI Responses API client.
 *
 * Provides access to OpenAI's built-in tools like web search and file search.
 *
 * @example
 * ```ts
 * const client = new OpenAIResponsesClient('gpt-4o');
 *
 * // Web search
 * const result = await client.create('What is the latest news about AI?', {
 *   tools: [{ type: 'web_search' }]
 * });
 * console.log(result.output_text);
 * console.log(result.citations);
 *
 * // File search
 * const result = await client.create('What does the document say about pricing?', {
 *   tools: [{ type: 'file_search', vector_store_ids: ['vs_123'] }]
 * });
 * ```
 */
export class OpenAIResponsesClient {
  readonly model: ResponsesModel;
  private client: OpenAI;

  constructor(model: ResponsesModel = 'gpt-4o', config: LLMClientConfig = {}) {
    this.model = model;

    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass apiKey in config.');
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: config.baseUrl || undefined,
      timeout: config.timeout ?? 60000,
      maxRetries: 0,
    });
  }

  /**
   * Create a response using the Responses API.
   *
   * @param input - User input (string or message array)
   * @param options - Response options
   * @returns Response result with output and citations
   */
  async create(
    input: string | ResponsesInputMessage[],
    options: ResponsesOptions = {}
  ): Promise<ResponsesResult> {
    const response = await (this.client as any).responses.create({
      model: this.model,
      input: typeof input === 'string' ? input : input,
      tools: options.tools,
      temperature: options.temperature,
      max_output_tokens: options.max_output_tokens,
      instructions: options.instructions,
      previous_response_id: options.previous_response_id,
    });

    return this.parseResponse(response);
  }

  /**
   * Create a streaming response.
   *
   * @param input - User input
   * @param options - Response options
   * @yields Streaming events
   */
  async *createStream(
    input: string | ResponsesInputMessage[],
    options: Omit<ResponsesOptions, 'stream'> = {}
  ): AsyncGenerator<ResponsesStreamEvent, ResponsesResult, unknown> {
    const stream = await (this.client as any).responses.create({
      model: this.model,
      input: typeof input === 'string' ? input : input,
      tools: options.tools,
      temperature: options.temperature,
      max_output_tokens: options.max_output_tokens,
      instructions: options.instructions,
      previous_response_id: options.previous_response_id,
      stream: true,
    });

    let finalResponse: ResponsesResult | null = null;
    let outputText = '';
    const output: OutputItem[] = [];
    const citations: Citation[] = [];

    for await (const event of stream) {
      const eventType = event.type || event.event;

      switch (eventType) {
        case 'response.created':
          yield {
            type: 'response.created',
            response: { id: event.response?.id || event.id, model: this.model },
          };
          break;

        case 'response.output_item.added':
          if (event.item) {
            output.push(event.item);
            yield { type: 'response.output_item.added', item: event.item };
          }
          break;

        case 'response.output_text.delta':
          outputText += event.delta || '';
          yield {
            type: 'response.output_text.delta',
            delta: event.delta || '',
            item_id: event.item_id || '',
          };
          break;

        case 'response.output_text.done':
          yield {
            type: 'response.output_text.done',
            text: event.text || outputText,
            item_id: event.item_id || '',
          };
          break;

        case 'response.completed':
        case 'response.done':
          if (event.response) {
            finalResponse = this.parseResponse(event.response);
            yield { type: 'response.completed', response: finalResponse };
          }
          break;

        case 'response.failed':
        case 'error':
          yield {
            type: 'response.failed',
            error: { message: event.error?.message || 'Unknown error' },
          };
          break;
      }
    }

    // Return final response
    if (finalResponse) {
      return finalResponse;
    }

    // Build response from accumulated data
    return {
      id: '',
      model: this.model,
      output,
      output_text: outputText,
      citations,
    };
  }

  /**
   * Perform a web search and get cited results.
   *
   * @param query - Search query
   * @param options - Additional options
   * @returns Response with web search results and citations
   */
  async webSearch(
    query: string,
    options: Omit<ResponsesOptions, 'tools'> = {}
  ): Promise<ResponsesResult> {
    return this.create(query, {
      ...options,
      tools: [{ type: 'web_search' }],
    });
  }

  /**
   * Search files in vector stores.
   *
   * @param query - Search query
   * @param vectorStoreIds - Vector store IDs to search
   * @param options - Additional options
   * @returns Response with file search results and citations
   */
  async fileSearch(
    query: string,
    vectorStoreIds: string[],
    options: Omit<ResponsesOptions, 'tools'> & { maxResults?: number } = {}
  ): Promise<ResponsesResult> {
    const { maxResults, ...restOptions } = options;

    return this.create(query, {
      ...restOptions,
      tools: [{
        type: 'file_search',
        vector_store_ids: vectorStoreIds,
        max_num_results: maxResults,
      }],
    });
  }

  /**
   * Continue a conversation using previous response ID.
   *
   * @param input - New user input
   * @param previousResponseId - ID of the previous response
   * @param options - Additional options
   * @returns Response continuing the conversation
   */
  async continue(
    input: string,
    previousResponseId: string,
    options: Omit<ResponsesOptions, 'previous_response_id'> = {}
  ): Promise<ResponsesResult> {
    return this.create(input, {
      ...options,
      previous_response_id: previousResponseId,
    });
  }

  /**
   * Parse API response into our format.
   */
  private parseResponse(response: any): ResponsesResult {
    const output: OutputItem[] = [];
    const citations: Citation[] = [];
    let outputText = '';

    // Parse output items
    if (response.output && Array.isArray(response.output)) {
      for (const item of response.output) {
        switch (item.type) {
          case 'web_search_call':
            output.push({
              type: 'web_search_call',
              id: item.id,
              status: item.status,
              search_results: item.search_results,
            });
            break;

          case 'file_search_call':
            output.push({
              type: 'file_search_call',
              id: item.id,
              status: item.status,
              queries: item.queries || [],
              search_results: item.search_results,
            });
            break;

          case 'message':
            const messageContent: TextOutputContent[] = [];

            if (item.content && Array.isArray(item.content)) {
              for (const content of item.content) {
                if (content.type === 'output_text' || content.type === 'text') {
                  const annotations = this.parseAnnotations(content.annotations);
                  messageContent.push({
                    type: 'output_text',
                    text: content.text,
                    annotations,
                  });

                  outputText += content.text;
                  citations.push(...annotations);
                }
              }
            }

            output.push({
              type: 'message',
              id: item.id,
              role: 'assistant',
              content: messageContent,
            });
            break;
        }
      }
    }

    // Fallback to output_text if available
    if (!outputText && response.output_text) {
      outputText = response.output_text;
    }

    return {
      id: response.id || '',
      model: response.model || this.model,
      output,
      output_text: outputText,
      usage: response.usage ? {
        input_tokens: response.usage.input_tokens || response.usage.prompt_tokens || 0,
        output_tokens: response.usage.output_tokens || response.usage.completion_tokens || 0,
        total_tokens: response.usage.total_tokens || 0,
      } : undefined,
      citations,
    };
  }

  /**
   * Parse annotation objects into citations.
   */
  private parseAnnotations(annotations: any[] | undefined): Citation[] {
    if (!annotations || !Array.isArray(annotations)) {
      return [];
    }

    return annotations.map((ann): Citation => {
      if (ann.type === 'url_citation') {
        return {
          type: 'url_citation',
          start_index: ann.start_index ?? 0,
          end_index: ann.end_index ?? 0,
          url: ann.url || '',
          title: ann.title,
        };
      } else {
        return {
          type: 'file_citation',
          index: ann.index ?? 0,
          file_id: ann.file_id || '',
          filename: ann.filename || '',
          quote: ann.quote,
        };
      }
    });
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an OpenAI Responses API client.
 *
 * @param model - Model to use
 * @param config - Client configuration
 * @returns Configured client
 */
export function createResponsesClient(
  model: ResponsesModel = 'gpt-4o',
  config: LLMClientConfig = {}
): OpenAIResponsesClient {
  return new OpenAIResponsesClient(model, config);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a model supports the Responses API.
 *
 * @param model - Model to check
 * @returns True if the model supports Responses API
 */
export function supportsResponsesAPI(model: string): model is ResponsesModel {
  const supportedModels: ResponsesModel[] = [
    'gpt-5', 'gpt-5-mini', 'gpt-5.1', 'gpt-5.2',
    'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
    'gpt-4o', 'gpt-4o-mini',
  ];
  return supportedModels.includes(model as ResponsesModel);
}

/**
 * Extract all URLs from citations.
 *
 * @param citations - Array of citations
 * @returns Array of unique URLs
 */
export function extractCitationUrls(citations: Citation[]): string[] {
  const urls = new Set<string>();

  for (const citation of citations) {
    if (citation.type === 'url_citation' && citation.url) {
      urls.add(citation.url);
    }
  }

  return Array.from(urls);
}

/**
 * Extract all file IDs from citations.
 *
 * @param citations - Array of citations
 * @returns Array of unique file IDs
 */
export function extractCitationFileIds(citations: Citation[]): string[] {
  const fileIds = new Set<string>();

  for (const citation of citations) {
    if (citation.type === 'file_citation' && citation.file_id) {
      fileIds.add(citation.file_id);
    }
  }

  return Array.from(fileIds);
}

/**
 * Format citations as markdown footnotes.
 *
 * @param text - Original text
 * @param citations - Citations to format
 * @returns Text with footnote-style citations
 */
export function formatCitationsAsFootnotes(text: string, citations: Citation[]): string {
  if (citations.length === 0) {
    return text;
  }

  let formattedText = text;
  const footnotes: string[] = [];
  let footnoteIndex = 1;

  // Sort citations by index (descending) to avoid offset issues
  const sortedCitations = [...citations].sort((a, b) => {
    const indexA = a.type === 'url_citation' ? a.end_index : a.index;
    const indexB = b.type === 'url_citation' ? b.end_index : b.index;
    return indexB - indexA;
  });

  for (const citation of sortedCitations) {
    if (citation.type === 'url_citation') {
      const footnoteRef = `[${footnoteIndex}]`;
      footnotes.unshift(`[${footnoteIndex}]: ${citation.url}${citation.title ? ` "${citation.title}"` : ''}`);
      // Insert footnote reference at end_index
      formattedText = formattedText.slice(0, citation.end_index) + footnoteRef + formattedText.slice(citation.end_index);
      footnoteIndex++;
    } else if (citation.type === 'file_citation') {
      const footnoteRef = `[${footnoteIndex}]`;
      footnotes.unshift(`[${footnoteIndex}]: ${citation.filename} (file: ${citation.file_id})`);
      // Insert footnote reference at index
      formattedText = formattedText.slice(0, citation.index) + footnoteRef + formattedText.slice(citation.index);
      footnoteIndex++;
    }
  }

  if (footnotes.length > 0) {
    formattedText += '\n\n---\n' + footnotes.join('\n');
  }

  return formattedText;
}

/**
 * Create a web search tool configuration.
 */
export function webSearchTool(options: Omit<WebSearchTool, 'type'> = {}): WebSearchTool {
  return { type: 'web_search', ...options };
}

/**
 * Create a file search tool configuration.
 */
export function fileSearchTool(
  vectorStoreIds: string[],
  options: Omit<FileSearchTool, 'type' | 'vector_store_ids'> = {}
): FileSearchTool {
  return { type: 'file_search', vector_store_ids: vectorStoreIds, ...options };
}
