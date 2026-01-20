/**
 * Find Usages MCP Tool
 *
 * Finds all usages of a symbol across the codebase.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  MCPToolDefinition,
  ToolHandler,
  CodebaseIndex,
  IndexedFile,
} from '../types.js';

/**
 * Tool definition for find_usages
 */
export const findUsagesDefinition: MCPToolDefinition = {
  name: 'find_usages',
  description:
    'Find all usages of a function, class, variable, or type across the codebase. ' +
    'Shows where the symbol is defined and everywhere it is referenced.',
  inputSchema: {
    type: 'object',
    properties: {
      symbolName: {
        type: 'string',
        description: 'Name of the symbol to find usages for',
      },
      path: {
        type: 'string',
        description: 'Optional file path to start the search from',
      },
      includeDefinition: {
        type: 'boolean',
        description: 'Include the definition location in results',
        default: true,
      },
      includeTests: {
        type: 'boolean',
        description: 'Include usages in test files',
        default: true,
      },
      caseSensitive: {
        type: 'boolean',
        description: 'Case-sensitive search',
        default: true,
      },
    },
    required: ['symbolName'],
  },
};

/**
 * Find usages arguments interface
 */
interface FindUsagesArgs {
  symbolName: string;
  path?: string;
  includeDefinition?: boolean;
  includeTests?: boolean;
  caseSensitive?: boolean;
}

/**
 * Usage result
 */
interface UsageResult {
  file: string;
  line: number;
  column: number;
  code: string;
  context: string;
  isDefinition: boolean;
  isImport: boolean;
  isExport: boolean;
}

/**
 * Create find_usages tool handler
 */
export function createFindUsagesHandler(): ToolHandler<FindUsagesArgs> {
  return async (args, context) => {
    const {
      symbolName,
      path: startPath,
      includeDefinition = true,
      includeTests = true,
      caseSensitive = true,
    } = args;

    if (!context.index) {
      return {
        error: 'Codebase has not been indexed. Please run indexing first.',
        suggestion: 'Use the index_codebase tool to index the project.',
      };
    }

    const usages: UsageResult[] = [];
    let definition: UsageResult | null = null;

    // Search through all indexed files
    for (const file of context.index.files.values()) {
      // Skip test files if not requested
      if (!includeTests && isTestFile(file.relativePath)) {
        continue;
      }

      // Filter by path if specified
      if (startPath && !file.relativePath.startsWith(startPath)) {
        continue;
      }

      // Read file content
      let content: string;
      try {
        content = await fs.readFile(file.path, 'utf-8');
      } catch {
        continue;
      }

      const lines = content.split('\n');

      // Find usages in this file
      const fileUsages = findUsagesInFile(
        symbolName,
        lines,
        file.relativePath,
        caseSensitive
      );

      for (const usage of fileUsages) {
        if (usage.isDefinition) {
          definition = usage;
          if (includeDefinition) {
            usages.push(usage);
          }
        } else {
          usages.push(usage);
        }
      }
    }

    if (usages.length === 0 && !definition) {
      return {
        symbol: symbolName,
        message: `No usages found for symbol: ${symbolName}`,
        suggestions: [
          'Check the spelling of the symbol name',
          'Try with caseSensitive: false',
          'The symbol might be dynamically generated',
        ],
      };
    }

    // Group usages by file
    const groupedUsages = groupByFile(usages);

    return {
      symbol: symbolName,
      definition: definition
        ? {
            file: definition.file,
            line: definition.line,
            code: definition.code,
          }
        : null,
      totalUsages: usages.length,
      fileCount: Object.keys(groupedUsages).length,
      usagesByFile: groupedUsages,
      summary: generateUsageSummary(usages, definition),
    };
  };
}

/**
 * Find usages in a single file
 */
function findUsagesInFile(
  symbolName: string,
  lines: string[],
  filePath: string,
  caseSensitive: boolean
): UsageResult[] {
  const usages: UsageResult[] = [];
  const pattern = caseSensitive
    ? new RegExp(`\\b${escapeRegex(symbolName)}\\b`, 'g')
    : new RegExp(`\\b${escapeRegex(symbolName)}\\b`, 'gi');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;

    while ((match = pattern.exec(line)) !== null) {
      const isDefinition = checkIfDefinition(line, symbolName, match.index);
      const isImport = checkIfImport(line);
      const isExport = checkIfExport(line);

      usages.push({
        file: filePath,
        line: i + 1,
        column: match.index + 1,
        code: line.trim(),
        context: getContext(lines, i),
        isDefinition,
        isImport,
        isExport,
      });
    }

    // Reset regex lastIndex for next line
    pattern.lastIndex = 0;
  }

  return usages;
}

/**
 * Check if this usage is a definition
 */
function checkIfDefinition(line: string, symbolName: string, index: number): boolean {
  const beforeSymbol = line.slice(0, index).trim();

  // Check for common definition patterns
  const definitionPatterns = [
    /^(?:export\s+)?(?:async\s+)?function\s*$/,
    /^(?:export\s+)?(?:const|let|var)\s*$/,
    /^(?:export\s+)?class\s*$/,
    /^(?:export\s+)?interface\s*$/,
    /^(?:export\s+)?type\s*$/,
    /^(?:export\s+)?enum\s*$/,
    /^def\s*$/, // Python
    /^func\s*$/, // Go
    /^fn\s*$/, // Rust
    /^pub\s+(?:fn|struct|enum|trait)\s*$/, // Rust with pub
  ];

  return definitionPatterns.some((p) => p.test(beforeSymbol));
}

/**
 * Check if line is an import statement
 */
function checkIfImport(line: string): boolean {
  return (
    line.includes('import ') ||
    line.includes('from ') ||
    line.includes('require(')
  );
}

/**
 * Check if line is an export statement
 */
function checkIfExport(line: string): boolean {
  return line.trimStart().startsWith('export');
}

/**
 * Get context lines around a usage
 */
function getContext(lines: string[], lineIndex: number): string {
  const start = Math.max(0, lineIndex - 1);
  const end = Math.min(lines.length - 1, lineIndex + 1);

  return lines
    .slice(start, end + 1)
    .map((l, i) => (i + start === lineIndex ? `> ${l}` : `  ${l}`))
    .join('\n');
}

/**
 * Check if file is a test file
 */
function isTestFile(filePath: string): boolean {
  const testPatterns = [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /_test\.[jt]sx?$/,
    /test_.*\.[jt]sx?$/,
    /__tests__\//,
    /tests?\//,
    /\.test\.py$/,
    /_test\.py$/,
    /test_.*\.py$/,
    /_test\.go$/,
    /_test\.rs$/,
  ];

  return testPatterns.some((p) => p.test(filePath));
}

/**
 * Group usages by file
 */
function groupByFile(usages: UsageResult[]): Record<string, UsageResult[]> {
  const grouped: Record<string, UsageResult[]> = {};

  for (const usage of usages) {
    if (!grouped[usage.file]) {
      grouped[usage.file] = [];
    }
    grouped[usage.file].push({
      ...usage,
      file: undefined as unknown as string, // Remove redundant file field in grouped output
    });
  }

  // Clean up the grouped output
  for (const file of Object.keys(grouped)) {
    grouped[file] = grouped[file].map((u) => ({
      line: u.line,
      column: u.column,
      code: u.code,
      isDefinition: u.isDefinition,
      isImport: u.isImport,
      isExport: u.isExport,
    })) as UsageResult[];
  }

  return grouped;
}

/**
 * Generate usage summary
 */
function generateUsageSummary(
  usages: UsageResult[],
  definition: UsageResult | null
): Record<string, unknown> {
  const imports = usages.filter((u) => u.isImport).length;
  const exports = usages.filter((u) => u.isExport).length;
  const references = usages.filter((u) => !u.isImport && !u.isExport && !u.isDefinition).length;

  return {
    hasDefinition: !!definition,
    totalReferences: references,
    totalImports: imports,
    totalExports: exports,
    isWidelyUsed: usages.length > 10,
    isUnused: usages.length === 0 || (usages.length === 1 && usages[0].isDefinition),
  };
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
