/**
 * Sandbox Tools Module
 *
 * Provides built-in tools and support for custom tool registration
 * within the RLM sandbox environment.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * A tool that can be injected into the sandbox.
 */
export interface SandboxTool {
  /** Unique identifier for the tool */
  name: string;
  /** Description of what the tool does */
  description: string;
  /** The function implementation */
  fn: (...args: unknown[]) => unknown;
  /** Whether this tool is async */
  async?: boolean;
  /** Parameter descriptions for documentation */
  parameters?: ToolParameter[];
  /** Example usage */
  example?: string;
  /** Category for grouping tools */
  category?: ToolCategory;
}

/**
 * Tool parameter definition.
 */
export interface ToolParameter {
  /** Parameter name */
  name: string;
  /** Parameter type */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'any';
  /** Description of the parameter */
  description: string;
  /** Whether the parameter is required */
  required?: boolean;
  /** Default value if not provided */
  default?: unknown;
}

/**
 * Tool categories for organization.
 */
export type ToolCategory =
  | 'data'
  | 'text'
  | 'network'
  | 'utility'
  | 'custom';

/**
 * Options for the safeFetch tool.
 */
export interface FetchOptions {
  /** Request method (default: GET) */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body (for POST/PUT/PATCH) */
  body?: string | object;
  /** Request timeout in ms (default: 10000) */
  timeout?: number;
}

/**
 * Result from safeFetch.
 */
export interface FetchResult {
  /** Response status code */
  status: number;
  /** Response status text */
  statusText: string;
  /** Response headers */
  headers: Record<string, string>;
  /** Response body as text */
  text: string;
  /** Whether the request succeeded (status 200-299) */
  ok: boolean;
}

/**
 * Options for CSV parsing.
 */
export interface CSVParseOptions {
  /** Delimiter character (default: ',') */
  delimiter?: string;
  /** Whether first row is headers (default: true) */
  headers?: boolean;
  /** Skip empty lines (default: true) */
  skipEmpty?: boolean;
}

// =============================================================================
// Built-in Tools
// =============================================================================

/**
 * Safe JSON parsing with error handling.
 */
export const parseJSONTool: SandboxTool = {
  name: 'parseJSON',
  description: 'Safely parse a JSON string into an object. Returns null on parse error.',
  category: 'data',
  parameters: [
    { name: 'text', type: 'string', description: 'JSON string to parse', required: true },
    { name: 'defaultValue', type: 'any', description: 'Value to return on parse error', required: false },
  ],
  example: 'parseJSON(\'{"name": "John"}\') // { name: "John" }',
  fn: (text: unknown, defaultValue: unknown = null): unknown => {
    if (typeof text !== 'string') {
      return defaultValue;
    }
    try {
      return JSON.parse(text);
    } catch {
      return defaultValue;
    }
  },
};

/**
 * CSV parsing tool.
 */
export const parseCSVTool: SandboxTool = {
  name: 'parseCSV',
  description: 'Parse CSV text into an array of objects (if headers) or array of arrays.',
  category: 'data',
  parameters: [
    { name: 'text', type: 'string', description: 'CSV text to parse', required: true },
    { name: 'options', type: 'object', description: 'Parse options (delimiter, headers, skipEmpty)', required: false },
  ],
  example: 'parseCSV("name,age\\nJohn,30") // [{ name: "John", age: "30" }]',
  fn: (text: unknown, options?: unknown): unknown[] => {
    if (typeof text !== 'string') {
      return [];
    }

    const opts: CSVParseOptions = {
      delimiter: ',',
      headers: true,
      skipEmpty: true,
      ...(options && typeof options === 'object' ? options : {}),
    };

    const lines = text.split('\n');
    const result: unknown[] = [];

    if (lines.length === 0) {
      return result;
    }

    // Parse a CSV line respecting quotes
    const parseLine = (line: string): string[] => {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === opts.delimiter && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      return values;
    };

    let headers: string[] = [];
    let startIndex = 0;

    if (opts.headers && lines.length > 0) {
      headers = parseLine(lines[0]);
      startIndex = 1;
    }

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (opts.skipEmpty && line === '') {
        continue;
      }

      const values = parseLine(line);

      if (opts.headers && headers.length > 0) {
        const obj: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) {
          obj[headers[j]] = values[j] || '';
        }
        result.push(obj);
      } else {
        result.push(values);
      }
    }

    return result;
  },
};

/**
 * Format data as a table.
 */
export const formatTableTool: SandboxTool = {
  name: 'formatTable',
  description: 'Format an array of objects as a text table.',
  category: 'data',
  parameters: [
    { name: 'data', type: 'array', description: 'Array of objects to format', required: true },
    { name: 'columns', type: 'array', description: 'Column names to include (optional, defaults to all keys)', required: false },
  ],
  example: 'formatTable([{ name: "John", age: 30 }]) // "| name | age |\\n|------|-----|\\n| John | 30  |"',
  fn: (data: unknown, columns?: unknown): string => {
    if (!Array.isArray(data) || data.length === 0) {
      return '';
    }

    // Get columns from first object if not specified
    const cols: string[] = Array.isArray(columns)
      ? columns.map(String)
      : Object.keys(data[0] || {});

    if (cols.length === 0) {
      return '';
    }

    // Calculate column widths
    const widths: number[] = cols.map((col) => {
      const headerWidth = String(col).length;
      const maxDataWidth = Math.max(
        ...data.map((row) => {
          const val = row && typeof row === 'object' ? (row as Record<string, unknown>)[col] : '';
          return String(val ?? '').length;
        })
      );
      return Math.max(headerWidth, maxDataWidth);
    });

    // Build table
    const lines: string[] = [];

    // Header row
    const headerCells = cols.map((col, i) => String(col).padEnd(widths[i]));
    lines.push(`| ${headerCells.join(' | ')} |`);

    // Separator row
    const separatorCells = widths.map((w) => '-'.repeat(w));
    lines.push(`| ${separatorCells.join(' | ')} |`);

    // Data rows
    for (const row of data) {
      const cells = cols.map((col, i) => {
        const val = row && typeof row === 'object' ? (row as Record<string, unknown>)[col] : '';
        return String(val ?? '').padEnd(widths[i]);
      });
      lines.push(`| ${cells.join(' | ')} |`);
    }

    return lines.join('\n');
  },
};

/**
 * Remove duplicates from an array.
 */
export const dedupeTool: SandboxTool = {
  name: 'dedupe',
  description: 'Remove duplicate values from an array. For objects, optionally specify a key to compare.',
  category: 'utility',
  parameters: [
    { name: 'array', type: 'array', description: 'Array to deduplicate', required: true },
    { name: 'key', type: 'string', description: 'Object key to use for comparison (optional)', required: false },
  ],
  example: 'dedupe([1, 2, 2, 3]) // [1, 2, 3]',
  fn: (array: unknown, key?: unknown): unknown[] => {
    if (!Array.isArray(array)) {
      return [];
    }

    if (typeof key === 'string') {
      // Dedupe by object key
      const seen = new Set<unknown>();
      return array.filter((item) => {
        if (item && typeof item === 'object') {
          const val = (item as Record<string, unknown>)[key];
          if (seen.has(val)) {
            return false;
          }
          seen.add(val);
          return true;
        }
        return true;
      });
    }

    // Dedupe primitives or full object comparison
    const seen = new Set<string>();
    return array.filter((item) => {
      const serialized = typeof item === 'object' ? JSON.stringify(item) : String(item);
      if (seen.has(serialized)) {
        return false;
      }
      seen.add(serialized);
      return true;
    });
  },
};

/**
 * Sort an array.
 */
export const sortTool: SandboxTool = {
  name: 'sort',
  description: 'Sort an array. For objects, specify a key to sort by.',
  category: 'utility',
  parameters: [
    { name: 'array', type: 'array', description: 'Array to sort', required: true },
    { name: 'key', type: 'string', description: 'Object key to sort by (optional)', required: false },
    { name: 'descending', type: 'boolean', description: 'Sort in descending order (default: false)', required: false },
  ],
  example: 'sort([3, 1, 2]) // [1, 2, 3]',
  fn: (array: unknown, key?: unknown, descending?: unknown): unknown[] => {
    if (!Array.isArray(array)) {
      return [];
    }

    const result = [...array];
    const desc = descending === true;

    result.sort((a, b) => {
      let valA: unknown = a;
      let valB: unknown = b;

      if (typeof key === 'string' && a && b && typeof a === 'object' && typeof b === 'object') {
        valA = (a as Record<string, unknown>)[key];
        valB = (b as Record<string, unknown>)[key];
      }

      // Compare values
      let comparison = 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        comparison = valA - valB;
      } else if (typeof valA === 'string' && typeof valB === 'string') {
        comparison = valA.localeCompare(valB);
      } else {
        comparison = String(valA).localeCompare(String(valB));
      }

      return desc ? -comparison : comparison;
    });

    return result;
  },
};

/**
 * Group array items by a key.
 */
export const groupByTool: SandboxTool = {
  name: 'groupBy',
  description: 'Group array items by a key value.',
  category: 'utility',
  parameters: [
    { name: 'array', type: 'array', description: 'Array to group', required: true },
    { name: 'key', type: 'string', description: 'Object key to group by', required: true },
  ],
  example: 'groupBy([{ type: "a", v: 1 }, { type: "b", v: 2 }], "type") // { a: [...], b: [...] }',
  fn: (array: unknown, key: unknown): Record<string, unknown[]> => {
    if (!Array.isArray(array) || typeof key !== 'string') {
      return {};
    }

    const result: Record<string, unknown[]> = {};

    for (const item of array) {
      if (item && typeof item === 'object') {
        const keyValue = String((item as Record<string, unknown>)[key] ?? 'undefined');
        if (!result[keyValue]) {
          result[keyValue] = [];
        }
        result[keyValue].push(item);
      }
    }

    return result;
  },
};

/**
 * Flatten a nested array.
 */
export const flattenTool: SandboxTool = {
  name: 'flatten',
  description: 'Flatten a nested array to a specified depth.',
  category: 'utility',
  parameters: [
    { name: 'array', type: 'array', description: 'Array to flatten', required: true },
    { name: 'depth', type: 'number', description: 'Depth to flatten (default: 1)', required: false },
  ],
  example: 'flatten([[1, 2], [3, [4]]]) // [1, 2, 3, [4]]',
  fn: (array: unknown, depth?: unknown): unknown[] => {
    if (!Array.isArray(array)) {
      return [];
    }
    const d = typeof depth === 'number' && depth >= 0 ? depth : 1;
    return array.flat(d);
  },
};

/**
 * Pick specific keys from objects.
 */
export const pickTool: SandboxTool = {
  name: 'pick',
  description: 'Pick specific keys from an object or array of objects.',
  category: 'utility',
  parameters: [
    { name: 'data', type: 'any', description: 'Object or array of objects', required: true },
    { name: 'keys', type: 'array', description: 'Keys to pick', required: true },
  ],
  example: 'pick({ a: 1, b: 2, c: 3 }, ["a", "c"]) // { a: 1, c: 3 }',
  fn: (data: unknown, keys: unknown): unknown => {
    if (!Array.isArray(keys)) {
      return data;
    }

    const keySet = new Set(keys.map(String));

    const pickFromObject = (obj: Record<string, unknown>): Record<string, unknown> => {
      const result: Record<string, unknown> = {};
      for (const key of keySet) {
        if (key in obj) {
          result[key] = obj[key];
        }
      }
      return result;
    };

    if (Array.isArray(data)) {
      return data.map((item) => {
        if (item && typeof item === 'object') {
          return pickFromObject(item as Record<string, unknown>);
        }
        return item;
      });
    }

    if (data && typeof data === 'object') {
      return pickFromObject(data as Record<string, unknown>);
    }

    return data;
  },
};

/**
 * Omit specific keys from objects.
 */
export const omitTool: SandboxTool = {
  name: 'omit',
  description: 'Omit specific keys from an object or array of objects.',
  category: 'utility',
  parameters: [
    { name: 'data', type: 'any', description: 'Object or array of objects', required: true },
    { name: 'keys', type: 'array', description: 'Keys to omit', required: true },
  ],
  example: 'omit({ a: 1, b: 2, c: 3 }, ["b"]) // { a: 1, c: 3 }',
  fn: (data: unknown, keys: unknown): unknown => {
    if (!Array.isArray(keys)) {
      return data;
    }

    const keySet = new Set(keys.map(String));

    const omitFromObject = (obj: Record<string, unknown>): Record<string, unknown> => {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(obj)) {
        if (!keySet.has(key)) {
          result[key] = obj[key];
        }
      }
      return result;
    };

    if (Array.isArray(data)) {
      return data.map((item) => {
        if (item && typeof item === 'object') {
          return omitFromObject(item as Record<string, unknown>);
        }
        return item;
      });
    }

    if (data && typeof data === 'object') {
      return omitFromObject(data as Record<string, unknown>);
    }

    return data;
  },
};

/**
 * Count occurrences of items.
 */
export const countByTool: SandboxTool = {
  name: 'countBy',
  description: 'Count occurrences of values in an array.',
  category: 'utility',
  parameters: [
    { name: 'array', type: 'array', description: 'Array to count', required: true },
    { name: 'key', type: 'string', description: 'Object key to count by (optional)', required: false },
  ],
  example: 'countBy(["a", "b", "a"]) // { a: 2, b: 1 }',
  fn: (array: unknown, key?: unknown): Record<string, number> => {
    if (!Array.isArray(array)) {
      return {};
    }

    const result: Record<string, number> = {};

    for (const item of array) {
      let value: string;
      if (typeof key === 'string' && item && typeof item === 'object') {
        value = String((item as Record<string, unknown>)[key] ?? 'undefined');
      } else {
        value = String(item);
      }
      result[value] = (result[value] || 0) + 1;
    }

    return result;
  },
};

/**
 * Summarize numeric values.
 */
export const summarizeTool: SandboxTool = {
  name: 'summarize',
  description: 'Get statistical summary of numeric values (sum, avg, min, max, count).',
  category: 'data',
  parameters: [
    { name: 'array', type: 'array', description: 'Array of numbers or objects', required: true },
    { name: 'key', type: 'string', description: 'Object key for numeric value (optional)', required: false },
  ],
  example: 'summarize([1, 2, 3, 4, 5]) // { sum: 15, avg: 3, min: 1, max: 5, count: 5 }',
  fn: (array: unknown, key?: unknown): { sum: number; avg: number; min: number; max: number; count: number } | null => {
    if (!Array.isArray(array) || array.length === 0) {
      return null;
    }

    const values: number[] = array
      .map((item) => {
        if (typeof key === 'string' && item && typeof item === 'object') {
          return (item as Record<string, unknown>)[key];
        }
        return item;
      })
      .filter((v): v is number => typeof v === 'number' && !isNaN(v));

    if (values.length === 0) {
      return null;
    }

    const sum = values.reduce((a, b) => a + b, 0);
    return {
      sum,
      avg: sum / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
    };
  },
};

/**
 * Extract text between markers.
 */
export const extractBetweenTool: SandboxTool = {
  name: 'extractBetween',
  description: 'Extract text between start and end markers.',
  category: 'text',
  parameters: [
    { name: 'text', type: 'string', description: 'Text to search', required: true },
    { name: 'start', type: 'string', description: 'Start marker', required: true },
    { name: 'end', type: 'string', description: 'End marker', required: true },
    { name: 'includeMarkers', type: 'boolean', description: 'Include markers in result (default: false)', required: false },
  ],
  example: 'extractBetween("<tag>content</tag>", "<tag>", "</tag>") // ["content"]',
  fn: (text: unknown, start: unknown, end: unknown, includeMarkers?: unknown): string[] => {
    if (typeof text !== 'string' || typeof start !== 'string' || typeof end !== 'string') {
      return [];
    }

    const results: string[] = [];
    let pos = 0;
    const include = includeMarkers === true;

    while (pos < text.length) {
      const startIdx = text.indexOf(start, pos);
      if (startIdx === -1) break;

      const contentStart = startIdx + start.length;
      const endIdx = text.indexOf(end, contentStart);
      if (endIdx === -1) break;

      if (include) {
        results.push(text.slice(startIdx, endIdx + end.length));
      } else {
        results.push(text.slice(contentStart, endIdx));
      }

      pos = endIdx + end.length;
    }

    return results;
  },
};

/**
 * Truncate text to a maximum length.
 */
export const truncateTool: SandboxTool = {
  name: 'truncate',
  description: 'Truncate text to a maximum length with optional suffix.',
  category: 'text',
  parameters: [
    { name: 'text', type: 'string', description: 'Text to truncate', required: true },
    { name: 'maxLength', type: 'number', description: 'Maximum length', required: true },
    { name: 'suffix', type: 'string', description: 'Suffix to add if truncated (default: "...")', required: false },
  ],
  example: 'truncate("Hello World", 8) // "Hello..."',
  fn: (text: unknown, maxLength: unknown, suffix?: unknown): string => {
    if (typeof text !== 'string' || typeof maxLength !== 'number') {
      return String(text ?? '');
    }

    const suf = typeof suffix === 'string' ? suffix : '...';

    if (text.length <= maxLength) {
      return text;
    }

    return text.slice(0, maxLength - suf.length) + suf;
  },
};

/**
 * Word count and text statistics.
 */
export const textStatsTool: SandboxTool = {
  name: 'textStats',
  description: 'Get statistics about text (word count, line count, char count).',
  category: 'text',
  parameters: [
    { name: 'text', type: 'string', description: 'Text to analyze', required: true },
  ],
  example: 'textStats("Hello World") // { chars: 11, words: 2, lines: 1, sentences: 0 }',
  fn: (text: unknown): { chars: number; words: number; lines: number; sentences: number } => {
    if (typeof text !== 'string') {
      return { chars: 0, words: 0, lines: 0, sentences: 0 };
    }

    const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
    const lines = text.split('\n');
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

    return {
      chars: text.length,
      words: words.length,
      lines: lines.length,
      sentences: sentences.length,
    };
  },
};

// =============================================================================
// Tool Registry
// =============================================================================

/**
 * All built-in tools.
 */
export const BUILTIN_TOOLS: SandboxTool[] = [
  parseJSONTool,
  parseCSVTool,
  formatTableTool,
  dedupeTool,
  sortTool,
  groupByTool,
  flattenTool,
  pickTool,
  omitTool,
  countByTool,
  summarizeTool,
  extractBetweenTool,
  truncateTool,
  textStatsTool,
];

/**
 * Tool registry for managing available tools.
 */
export interface ToolRegistry {
  /** Get a tool by name */
  get(name: string): SandboxTool | undefined;
  /** List all tools */
  list(): SandboxTool[];
  /** List tools by category */
  listByCategory(category: ToolCategory): SandboxTool[];
  /** Register a custom tool */
  register(tool: SandboxTool): void;
  /** Unregister a tool */
  unregister(name: string): boolean;
  /** Check if a tool exists */
  has(name: string): boolean;
  /** Get all tools as a map for sandbox injection */
  toSandboxMap(): Record<string, (...args: unknown[]) => unknown>;
}

/**
 * Create a new tool registry.
 */
export function createToolRegistry(includeBuiltins: boolean = true): ToolRegistry {
  const tools = new Map<string, SandboxTool>();

  if (includeBuiltins) {
    for (const tool of BUILTIN_TOOLS) {
      tools.set(tool.name, tool);
    }
  }

  return {
    get(name: string): SandboxTool | undefined {
      return tools.get(name);
    },

    list(): SandboxTool[] {
      return Array.from(tools.values());
    },

    listByCategory(category: ToolCategory): SandboxTool[] {
      return Array.from(tools.values()).filter((t) => t.category === category);
    },

    register(tool: SandboxTool): void {
      if (tools.has(tool.name)) {
        throw new Error(`Tool with name "${tool.name}" already exists`);
      }
      tools.set(tool.name, tool);
    },

    unregister(name: string): boolean {
      return tools.delete(name);
    },

    has(name: string): boolean {
      return tools.has(name);
    },

    toSandboxMap(): Record<string, (...args: unknown[]) => unknown> {
      const map: Record<string, (...args: unknown[]) => unknown> = {};
      for (const [name, tool] of tools) {
        map[name] = tool.fn;
      }
      return map;
    },
  };
}

/**
 * Default global tool registry.
 */
export const defaultToolRegistry = createToolRegistry();

/**
 * Get help text for available tools.
 */
export function getToolsHelp(): string {
  const tools = defaultToolRegistry.list();
  const lines = ['Available sandbox tools:', ''];

  // Group by category
  const byCategory = new Map<string, SandboxTool[]>();
  for (const tool of tools) {
    const cat = tool.category || 'utility';
    if (!byCategory.has(cat)) {
      byCategory.set(cat, []);
    }
    byCategory.get(cat)!.push(tool);
  }

  for (const [category, categoryTools] of byCategory) {
    lines.push(`${category.toUpperCase()}:`);
    for (const tool of categoryTools) {
      lines.push(`  ${tool.name.padEnd(15)} ${tool.description}`);
      if (tool.example) {
        lines.push(`                  Example: ${tool.example}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Validate a custom tool before registration.
 */
export function validateTool(tool: unknown): tool is SandboxTool {
  if (!tool || typeof tool !== 'object') {
    return false;
  }

  const t = tool as Record<string, unknown>;

  // Required fields
  if (typeof t.name !== 'string' || t.name.trim() === '') {
    return false;
  }

  if (typeof t.description !== 'string') {
    return false;
  }

  if (typeof t.fn !== 'function') {
    return false;
  }

  // Validate name format (alphanumeric and underscores only)
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t.name)) {
    return false;
  }

  return true;
}

/**
 * Create a safe wrapper for a tool function.
 * Adds error handling and argument validation.
 */
export function wrapToolFunction(tool: SandboxTool): (...args: unknown[]) => unknown {
  return (...args: unknown[]) => {
    try {
      return tool.fn(...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Tool "${tool.name}" error: ${message}`);
      return undefined;
    }
  };
}
