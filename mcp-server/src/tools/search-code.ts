/**
 * Search Code MCP Tool
 *
 * Natural language search over the indexed codebase.
 */

import {
  MCPToolDefinition,
  ToolHandler,
  SearchQuery,
  SearchFilters,
  SupportedLanguage,
} from '../types.js';
import { CodeSearchEngine } from '../search/search.js';

/**
 * Tool definition for search_code
 */
export const searchCodeDefinition: MCPToolDefinition = {
  name: 'search_code',
  description:
    'Search the codebase using natural language queries. Find code by functionality, ' +
    'patterns, or specific terms. Returns relevant code snippets ranked by relevance.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Natural language search query. Can be a description of functionality, ' +
          'a code pattern, or specific terms to search for.',
      },
      languages: {
        type: 'array',
        description: 'Filter results to specific programming languages',
        items: {
          type: 'string',
          enum: [
            'typescript',
            'javascript',
            'python',
            'go',
            'rust',
            'java',
            'kotlin',
            'c',
            'cpp',
          ],
        },
      },
      paths: {
        type: 'array',
        description: 'Filter results to files in specific paths',
        items: { type: 'string' },
      },
      excludePaths: {
        type: 'array',
        description: 'Exclude files from specific paths',
        items: { type: 'string' },
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 10)',
        default: 10,
      },
      includeContext: {
        type: 'boolean',
        description: 'Include surrounding code context in results',
        default: true,
      },
    },
    required: ['query'],
  },
};

/**
 * Search code arguments interface
 */
interface SearchCodeArgs {
  query: string;
  languages?: SupportedLanguage[];
  paths?: string[];
  excludePaths?: string[];
  limit?: number;
  includeContext?: boolean;
}

/**
 * Create search_code tool handler
 */
export function createSearchCodeHandler(searchEngine: CodeSearchEngine): ToolHandler<SearchCodeArgs> {
  return async (args, context) => {
    const { query, languages, paths, excludePaths, limit = 10, includeContext = true } = args;

    if (!context.index) {
      return {
        error: 'Codebase has not been indexed. Please run indexing first.',
        suggestion: 'Use the index_codebase tool to index the project.',
      };
    }

    // Set index on search engine
    searchEngine.setIndex(context.index);

    const filters: SearchFilters = {};
    if (languages) filters.languages = languages;
    if (paths) filters.paths = paths;
    if (excludePaths) filters.excludePaths = excludePaths;

    const searchQuery: SearchQuery = {
      query,
      filters,
      limit,
      includeContext,
      contextLines: 3,
    };

    const results = await searchEngine.search(searchQuery);

    if (results.length === 0) {
      return {
        message: `No results found for query: "${query}"`,
        suggestions: [
          'Try using different keywords',
          'Check if the file types are included in the index',
          'Broaden your search terms',
        ],
      };
    }

    return {
      query,
      totalResults: results.length,
      results: results.map((r) => ({
        file: r.file.relativePath,
        language: r.file.language,
        score: Math.round(r.score * 100) / 100,
        matchType: r.matchType,
        lines: {
          start: r.chunk.startLine,
          end: r.chunk.endLine,
        },
        symbols: r.chunk.symbols,
        code: r.chunk.content,
        highlights: r.highlights?.map((h) => ({
          text: h.text,
          position: h.startOffset,
        })),
      })),
    };
  };
}
