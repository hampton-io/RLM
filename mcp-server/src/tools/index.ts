/**
 * MCP Tools Index
 *
 * Exports all MCP tool definitions and handlers.
 */

export {
  searchCodeDefinition,
  createSearchCodeHandler,
} from './search-code.js';

export {
  explainCodeDefinition,
  createExplainCodeHandler,
} from './explain-code.js';

export {
  findUsagesDefinition,
  createFindUsagesHandler,
} from './find-usages.js';

export {
  analyzeDependenciesDefinition,
  createAnalyzeDependenciesHandler,
} from './analyze-dependencies.js';

import { MCPToolDefinition } from '../types.js';
import { searchCodeDefinition } from './search-code.js';
import { explainCodeDefinition } from './explain-code.js';
import { findUsagesDefinition } from './find-usages.js';
import { analyzeDependenciesDefinition } from './analyze-dependencies.js';

/**
 * All tool definitions
 */
export const ALL_TOOL_DEFINITIONS: MCPToolDefinition[] = [
  searchCodeDefinition,
  explainCodeDefinition,
  findUsagesDefinition,
  analyzeDependenciesDefinition,
];

/**
 * Index codebase tool definition
 */
export const indexCodebaseDefinition: MCPToolDefinition = {
  name: 'index_codebase',
  description:
    'Index the codebase for semantic search and code analysis. ' +
    'This should be run before using other code analysis tools.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Root path of the codebase to index (default: current directory)',
      },
      forceReindex: {
        type: 'boolean',
        description: 'Force re-indexing even if index exists',
        default: false,
      },
    },
    required: [],
  },
};

/**
 * Get index status tool definition
 */
export const getIndexStatusDefinition: MCPToolDefinition = {
  name: 'get_index_status',
  description: 'Get the current status of the codebase index.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

/**
 * Summarize module tool definition
 */
export const summarizeModuleDefinition: MCPToolDefinition = {
  name: 'summarize_module',
  description:
    'Generate a comprehensive summary of a module or directory, ' +
    'including its purpose, structure, and public API.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the module or directory to summarize',
      },
      includePrivate: {
        type: 'boolean',
        description: 'Include private/internal APIs in summary',
        default: false,
      },
    },
    required: ['path'],
  },
};

/**
 * Find security issues tool definition
 */
export const findSecurityIssuesDefinition: MCPToolDefinition = {
  name: 'find_security_issues',
  description:
    'Scan the codebase for common security vulnerabilities and issues.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to scan (default: entire codebase)',
      },
      severity: {
        type: 'string',
        description: 'Minimum severity level to report',
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium',
      },
    },
    required: [],
  },
};

/**
 * Suggest refactoring tool definition
 */
export const suggestRefactoringDefinition: MCPToolDefinition = {
  name: 'suggest_refactoring',
  description:
    'Analyze code and suggest refactoring opportunities to improve quality.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to analyze',
      },
      focus: {
        type: 'string',
        description: 'Focus area for suggestions',
        enum: ['complexity', 'duplication', 'naming', 'structure', 'all'],
        default: 'all',
      },
    },
    required: ['path'],
  },
};

/**
 * Get context tool definition
 */
export const getContextDefinition: MCPToolDefinition = {
  name: 'get_context',
  description:
    'Get relevant context for a file or code location, including ' +
    'related files, imports, and documentation.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to get context for',
      },
      line: {
        type: 'number',
        description: 'Optional line number for more specific context',
      },
      depth: {
        type: 'number',
        description: 'Depth of context to retrieve (default: 2)',
        default: 2,
      },
    },
    required: ['path'],
  },
};

/**
 * Answer question tool definition
 */
export const answerQuestionDefinition: MCPToolDefinition = {
  name: 'answer_question',
  description:
    'Answer questions about the codebase using RLM to process large contexts.',
  inputSchema: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'Question about the codebase',
      },
      scope: {
        type: 'string',
        description: 'Scope of the question (file path or "all")',
        default: 'all',
      },
    },
    required: ['question'],
  },
};

/**
 * Generate tests tool definition
 */
export const generateTestsDefinition: MCPToolDefinition = {
  name: 'generate_tests',
  description:
    'Generate unit tests for a function, class, or file.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to generate tests for',
      },
      symbolName: {
        type: 'string',
        description: 'Specific function or class to test',
      },
      framework: {
        type: 'string',
        description: 'Test framework to use',
        enum: ['jest', 'vitest', 'mocha', 'pytest', 'auto'],
        default: 'auto',
      },
    },
    required: ['path'],
  },
};
