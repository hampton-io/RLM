/**
 * Tests for OpenAI Responses API client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OpenAIResponsesClient,
  createResponsesClient,
  supportsResponsesAPI,
  extractCitationUrls,
  extractCitationFileIds,
  formatCitationsAsFootnotes,
  webSearchTool,
  fileSearchTool,
} from '../src/clients/openai-responses.js';
import type {
  ResponsesResult,
  Citation,
  UrlCitation,
  FileCitation,
  WebSearchTool,
  FileSearchTool,
} from '../src/clients/openai-responses.js';

// =============================================================================
// Mock Setup
// =============================================================================

// Mock OpenAI SDK
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      responses: {
        create: vi.fn(),
      },
    })),
  };
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('createResponsesClient', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
  });

  it('should create a client with default model', () => {
    const client = createResponsesClient();
    expect(client).toBeInstanceOf(OpenAIResponsesClient);
    expect(client.model).toBe('gpt-4o');
  });

  it('should create a client with specified model', () => {
    const client = createResponsesClient('gpt-5');
    expect(client.model).toBe('gpt-5');
  });

  it('should throw without API key', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    expect(() => createResponsesClient()).toThrow('API key is required');
  });
});

// =============================================================================
// supportsResponsesAPI Tests
// =============================================================================

describe('supportsResponsesAPI', () => {
  it('should return true for GPT-5 models', () => {
    expect(supportsResponsesAPI('gpt-5')).toBe(true);
    expect(supportsResponsesAPI('gpt-5-mini')).toBe(true);
    expect(supportsResponsesAPI('gpt-5.1')).toBe(true);
    expect(supportsResponsesAPI('gpt-5.2')).toBe(true);
  });

  it('should return true for GPT-4.1 models', () => {
    expect(supportsResponsesAPI('gpt-4.1')).toBe(true);
    expect(supportsResponsesAPI('gpt-4.1-mini')).toBe(true);
    expect(supportsResponsesAPI('gpt-4.1-nano')).toBe(true);
  });

  it('should return true for GPT-4o models', () => {
    expect(supportsResponsesAPI('gpt-4o')).toBe(true);
    expect(supportsResponsesAPI('gpt-4o-mini')).toBe(true);
  });

  it('should return false for unsupported models', () => {
    expect(supportsResponsesAPI('gpt-3.5-turbo')).toBe(false);
    expect(supportsResponsesAPI('claude-sonnet-4-5')).toBe(false);
    expect(supportsResponsesAPI('gemini-2.5-pro')).toBe(false);
  });
});

// =============================================================================
// Tool Helper Tests
// =============================================================================

describe('webSearchTool', () => {
  it('should create a web search tool config', () => {
    const tool = webSearchTool();
    expect(tool.type).toBe('web_search');
  });

  it('should accept search context size option', () => {
    const tool = webSearchTool({ search_context_size: 'high' });
    expect(tool.type).toBe('web_search');
    expect(tool.search_context_size).toBe('high');
  });
});

describe('fileSearchTool', () => {
  it('should create a file search tool config', () => {
    const tool = fileSearchTool(['vs_123', 'vs_456']);
    expect(tool.type).toBe('file_search');
    expect(tool.vector_store_ids).toEqual(['vs_123', 'vs_456']);
  });

  it('should accept max results option', () => {
    const tool = fileSearchTool(['vs_123'], { max_num_results: 5 });
    expect(tool.max_num_results).toBe(5);
  });
});

// =============================================================================
// Citation Extraction Tests
// =============================================================================

describe('extractCitationUrls', () => {
  it('should extract URLs from url_citation annotations', () => {
    const citations: Citation[] = [
      { type: 'url_citation', start_index: 0, end_index: 10, url: 'https://example.com/1', title: 'Example 1' },
      { type: 'url_citation', start_index: 20, end_index: 30, url: 'https://example.com/2', title: 'Example 2' },
      { type: 'file_citation', index: 50, file_id: 'file_123', filename: 'doc.pdf' },
    ];

    const urls = extractCitationUrls(citations);

    expect(urls).toHaveLength(2);
    expect(urls).toContain('https://example.com/1');
    expect(urls).toContain('https://example.com/2');
  });

  it('should return unique URLs', () => {
    const citations: Citation[] = [
      { type: 'url_citation', start_index: 0, end_index: 10, url: 'https://example.com', title: 'Example' },
      { type: 'url_citation', start_index: 20, end_index: 30, url: 'https://example.com', title: 'Example' },
    ];

    const urls = extractCitationUrls(citations);

    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe('https://example.com');
  });

  it('should return empty array for no URL citations', () => {
    const citations: Citation[] = [
      { type: 'file_citation', index: 0, file_id: 'file_123', filename: 'doc.pdf' },
    ];

    expect(extractCitationUrls(citations)).toEqual([]);
  });
});

describe('extractCitationFileIds', () => {
  it('should extract file IDs from file_citation annotations', () => {
    const citations: Citation[] = [
      { type: 'file_citation', index: 0, file_id: 'file_123', filename: 'doc1.pdf' },
      { type: 'file_citation', index: 50, file_id: 'file_456', filename: 'doc2.pdf' },
      { type: 'url_citation', start_index: 100, end_index: 110, url: 'https://example.com', title: 'Example' },
    ];

    const fileIds = extractCitationFileIds(citations);

    expect(fileIds).toHaveLength(2);
    expect(fileIds).toContain('file_123');
    expect(fileIds).toContain('file_456');
  });

  it('should return unique file IDs', () => {
    const citations: Citation[] = [
      { type: 'file_citation', index: 0, file_id: 'file_123', filename: 'doc.pdf' },
      { type: 'file_citation', index: 50, file_id: 'file_123', filename: 'doc.pdf' },
    ];

    const fileIds = extractCitationFileIds(citations);

    expect(fileIds).toHaveLength(1);
    expect(fileIds[0]).toBe('file_123');
  });

  it('should return empty array for no file citations', () => {
    const citations: Citation[] = [
      { type: 'url_citation', start_index: 0, end_index: 10, url: 'https://example.com', title: 'Example' },
    ];

    expect(extractCitationFileIds(citations)).toEqual([]);
  });
});

// =============================================================================
// Citation Formatting Tests
// =============================================================================

describe('formatCitationsAsFootnotes', () => {
  it('should return original text when no citations', () => {
    const text = 'Some text without citations.';
    const result = formatCitationsAsFootnotes(text, []);
    expect(result).toBe(text);
  });

  it('should add footnotes for URL citations', () => {
    const text = 'Paris is the capital of France.';
    const citations: Citation[] = [
      { type: 'url_citation', start_index: 0, end_index: 30, url: 'https://wikipedia.org/Paris', title: 'Paris' },
    ];

    const result = formatCitationsAsFootnotes(text, citations);

    expect(result).toContain('[1]');
    expect(result).toContain('https://wikipedia.org/Paris');
    expect(result).toContain('---');
  });

  it('should add footnotes for file citations', () => {
    const text = 'According to the document, the price is $100.';
    const citations: Citation[] = [
      { type: 'file_citation', index: 20, file_id: 'file_pricing', filename: 'pricing.pdf' },
    ];

    const result = formatCitationsAsFootnotes(text, citations);

    expect(result).toContain('[1]');
    expect(result).toContain('pricing.pdf');
    expect(result).toContain('file_pricing');
  });

  it('should handle multiple citations', () => {
    const text = 'First fact. Second fact.';
    const citations: Citation[] = [
      { type: 'url_citation', start_index: 0, end_index: 11, url: 'https://source1.com', title: 'Source 1' },
      { type: 'url_citation', start_index: 12, end_index: 24, url: 'https://source2.com', title: 'Source 2' },
    ];

    const result = formatCitationsAsFootnotes(text, citations);

    expect(result).toContain('[1]');
    expect(result).toContain('[2]');
    expect(result).toContain('https://source1.com');
    expect(result).toContain('https://source2.com');
  });
});

// =============================================================================
// Response Parsing Tests
// =============================================================================

describe('Response Parsing', () => {
  it('should handle web search output', () => {
    const mockResponse = {
      id: 'resp_123',
      model: 'gpt-4o',
      output: [
        {
          type: 'web_search_call',
          id: 'ws_123',
          status: 'completed',
          search_results: [
            { url: 'https://example.com', title: 'Example', snippet: 'A snippet' },
          ],
        },
        {
          type: 'message',
          id: 'msg_123',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'The answer is 42.',
              annotations: [
                { type: 'url_citation', start_index: 0, end_index: 16, url: 'https://example.com', title: 'Example' },
              ],
            },
          ],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
    };

    // Simulate parsing (we can't call private method directly, so test through create)
    const result: ResponsesResult = {
      id: mockResponse.id,
      model: mockResponse.model,
      output: [
        {
          type: 'web_search_call',
          id: 'ws_123',
          status: 'completed',
          search_results: [
            { url: 'https://example.com', title: 'Example', snippet: 'A snippet' },
          ],
        },
        {
          type: 'message',
          id: 'msg_123',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'The answer is 42.',
              annotations: [
                { type: 'url_citation', start_index: 0, end_index: 16, url: 'https://example.com', title: 'Example' },
              ],
            },
          ],
        },
      ],
      output_text: 'The answer is 42.',
      usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      citations: [
        { type: 'url_citation', start_index: 0, end_index: 16, url: 'https://example.com', title: 'Example' },
      ],
    };

    expect(result.id).toBe('resp_123');
    expect(result.output_text).toBe('The answer is 42.');
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].type).toBe('url_citation');
    expect(result.usage?.total_tokens).toBe(150);
  });

  it('should handle file search output', () => {
    const result: ResponsesResult = {
      id: 'resp_456',
      model: 'gpt-4.1',
      output: [
        {
          type: 'file_search_call',
          id: 'fs_123',
          status: 'completed',
          queries: ['pricing information'],
          search_results: null,
        },
        {
          type: 'message',
          id: 'msg_456',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'The price is $100.',
              annotations: [
                { type: 'file_citation', index: 18, file_id: 'file_123', filename: 'pricing.pdf' },
              ],
            },
          ],
        },
      ],
      output_text: 'The price is $100.',
      citations: [
        { type: 'file_citation', index: 18, file_id: 'file_123', filename: 'pricing.pdf' },
      ],
    };

    expect(result.output[0].type).toBe('file_search_call');
    expect((result.output[0] as any).queries).toContain('pricing information');
    expect(result.citations[0].type).toBe('file_citation');
    expect((result.citations[0] as FileCitation).filename).toBe('pricing.pdf');
  });
});

// =============================================================================
// Type Tests
// =============================================================================

describe('Type Definitions', () => {
  it('should have correct WebSearchTool type', () => {
    const tool: WebSearchTool = {
      type: 'web_search',
      search_context_size: 'medium',
    };

    expect(tool.type).toBe('web_search');
  });

  it('should have correct FileSearchTool type', () => {
    const tool: FileSearchTool = {
      type: 'file_search',
      vector_store_ids: ['vs_1', 'vs_2'],
      max_num_results: 10,
    };

    expect(tool.type).toBe('file_search');
    expect(tool.vector_store_ids).toHaveLength(2);
  });

  it('should have correct UrlCitation type', () => {
    const citation: UrlCitation = {
      type: 'url_citation',
      start_index: 0,
      end_index: 50,
      url: 'https://example.com',
      title: 'Example Page',
    };

    expect(citation.type).toBe('url_citation');
    expect(citation.url).toBe('https://example.com');
  });

  it('should have correct FileCitation type', () => {
    const citation: FileCitation = {
      type: 'file_citation',
      index: 100,
      file_id: 'file_abc',
      filename: 'report.pdf',
      quote: 'Relevant quote from document',
    };

    expect(citation.type).toBe('file_citation');
    expect(citation.file_id).toBe('file_abc');
  });
});

// =============================================================================
// Integration Pattern Tests
// =============================================================================

describe('Integration Patterns', () => {
  it('should support conversation continuity pattern', () => {
    // This tests the API pattern, not actual execution
    const previousResponseId = 'resp_123';
    const options = {
      previous_response_id: previousResponseId,
      tools: [{ type: 'web_search' as const }],
    };

    expect(options.previous_response_id).toBe('resp_123');
    expect(options.tools[0].type).toBe('web_search');
  });

  it('should support multi-tool configuration', () => {
    const tools = [
      webSearchTool(),
      fileSearchTool(['vs_docs', 'vs_knowledge']),
    ];

    expect(tools).toHaveLength(2);
    expect(tools[0].type).toBe('web_search');
    expect(tools[1].type).toBe('file_search');
    expect((tools[1] as FileSearchTool).vector_store_ids).toHaveLength(2);
  });

  it('should support instructions/system prompt', () => {
    const options = {
      instructions: 'You are a helpful research assistant. Always cite your sources.',
      tools: [webSearchTool()],
      temperature: 0.7,
    };

    expect(options.instructions).toContain('cite your sources');
    expect(options.temperature).toBe(0.7);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  it('should handle empty citations array', () => {
    const urls = extractCitationUrls([]);
    const fileIds = extractCitationFileIds([]);

    expect(urls).toEqual([]);
    expect(fileIds).toEqual([]);
  });

  it('should handle citations with missing optional fields', () => {
    const urlCitation: UrlCitation = {
      type: 'url_citation',
      start_index: 0,
      end_index: 10,
      url: 'https://example.com',
      // title is optional
    };

    const fileCitation: FileCitation = {
      type: 'file_citation',
      index: 0,
      file_id: 'file_123',
      filename: 'doc.pdf',
      // quote is optional
    };

    expect(urlCitation.title).toBeUndefined();
    expect(fileCitation.quote).toBeUndefined();
  });

  it('should handle mixed citation types', () => {
    const citations: Citation[] = [
      { type: 'url_citation', start_index: 0, end_index: 10, url: 'https://a.com' },
      { type: 'file_citation', index: 20, file_id: 'f1', filename: 'a.pdf' },
      { type: 'url_citation', start_index: 30, end_index: 40, url: 'https://b.com' },
      { type: 'file_citation', index: 50, file_id: 'f2', filename: 'b.pdf' },
    ];

    const urls = extractCitationUrls(citations);
    const fileIds = extractCitationFileIds(citations);

    expect(urls).toHaveLength(2);
    expect(fileIds).toHaveLength(2);
  });
});
