/**
 * Explain Code MCP Tool
 *
 * Explains code files, functions, or selected code segments.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  MCPToolDefinition,
  ToolHandler,
  CodeSymbol,
} from '../types.js';
import { detectLanguage, extractSymbols, getLanguageDisplayName } from '../utils/language.js';
import { fileExists } from '../utils/files.js';

/**
 * Tool definition for explain_code
 */
export const explainCodeDefinition: MCPToolDefinition = {
  name: 'explain_code',
  description:
    'Explain a code file, function, class, or code segment. Provides documentation-style ' +
    'explanations including purpose, parameters, return values, and usage examples.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to explain (relative to project root)',
      },
      symbolName: {
        type: 'string',
        description: 'Name of a specific function, class, or symbol to explain',
      },
      startLine: {
        type: 'number',
        description: 'Start line number for explaining a specific code range',
      },
      endLine: {
        type: 'number',
        description: 'End line number for explaining a specific code range',
      },
      detail: {
        type: 'string',
        description: 'Level of detail: brief, detailed, or comprehensive',
        enum: ['brief', 'detailed', 'comprehensive'],
        default: 'detailed',
      },
    },
    required: ['path'],
  },
};

/**
 * Explain code arguments interface
 */
interface ExplainCodeArgs {
  path: string;
  symbolName?: string;
  startLine?: number;
  endLine?: number;
  detail?: 'brief' | 'detailed' | 'comprehensive';
}

/**
 * Create explain_code tool handler
 */
export function createExplainCodeHandler(): ToolHandler<ExplainCodeArgs> {
  return async (args, context) => {
    const {
      path: filePath,
      symbolName,
      startLine,
      endLine,
      detail = 'detailed',
    } = args;

    // Resolve file path
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(context.config.rootPath, filePath);

    // Check if file exists
    if (!(await fileExists(absolutePath))) {
      return {
        error: `File not found: ${filePath}`,
        suggestion: 'Check the file path and try again.',
      };
    }

    // Read file content
    const content = await fs.readFile(absolutePath, 'utf-8');
    const lines = content.split('\n');
    const language = detectLanguage(absolutePath);
    const languageName = getLanguageDisplayName(language);

    // Extract symbols from the file
    const symbols = extractSymbols(content, language);

    // If symbol name specified, find and explain that symbol
    if (symbolName) {
      const symbol = findSymbol(symbols, symbolName);
      if (!symbol) {
        return {
          error: `Symbol not found: ${symbolName}`,
          availableSymbols: symbols.slice(0, 20).map((s) => ({
            name: s.name,
            kind: s.kind,
            line: s.startLine,
          })),
          suggestion: 'Check the symbol name or use one of the available symbols listed above.',
        };
      }

      return explainSymbol(symbol, lines, languageName, detail, filePath);
    }

    // If line range specified, explain that range
    if (startLine !== undefined) {
      const start = Math.max(1, startLine);
      const end = endLine || Math.min(start + 50, lines.length);
      const codeSection = lines.slice(start - 1, end).join('\n');

      // Find symbols in the range
      const rangeSymbols = symbols.filter(
        (s) => s.startLine >= start && s.startLine <= end
      );

      return {
        file: filePath,
        language: languageName,
        lines: { start, end },
        code: codeSection,
        analysis: analyzeCodeSection(codeSection, rangeSymbols, languageName, detail),
        symbols: rangeSymbols.map((s) => ({
          name: s.name,
          kind: s.kind,
          line: s.startLine,
          signature: s.signature,
        })),
      };
    }

    // Explain entire file
    return explainFile(content, symbols, languageName, detail, filePath);
  };
}

/**
 * Find a symbol by name (supports nested symbols)
 */
function findSymbol(symbols: CodeSymbol[], name: string): CodeSymbol | null {
  for (const symbol of symbols) {
    if (symbol.name === name) {
      return symbol;
    }
    if (symbol.children) {
      const found = findSymbol(symbol.children, name);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Explain a specific symbol
 */
function explainSymbol(
  symbol: CodeSymbol,
  lines: string[],
  language: string,
  detail: string,
  filePath: string
): Record<string, unknown> {
  const code = lines.slice(symbol.startLine - 1, symbol.endLine).join('\n');

  const result: Record<string, unknown> = {
    file: filePath,
    language,
    symbol: {
      name: symbol.name,
      kind: symbol.kind,
      lines: {
        start: symbol.startLine,
        end: symbol.endLine,
      },
      signature: symbol.signature,
    },
    code,
  };

  // Add analysis based on detail level
  if (detail === 'brief') {
    result.summary = generateBriefSummary(symbol, code);
  } else if (detail === 'detailed') {
    result.explanation = generateDetailedExplanation(symbol, code, language);
  } else {
    result.explanation = generateComprehensiveExplanation(symbol, code, language);
    result.relatedConcepts = identifyRelatedConcepts(code, language);
  }

  // Extract function signature details
  if (symbol.kind === 'function' || symbol.kind === 'method') {
    result.parameters = extractParameters(symbol.signature || code);
    result.returnType = extractReturnType(symbol.signature || code, language);
  }

  return result;
}

/**
 * Explain an entire file
 */
function explainFile(
  content: string,
  symbols: CodeSymbol[],
  language: string,
  detail: string,
  filePath: string
): Record<string, unknown> {
  const lines = content.split('\n');

  const result: Record<string, unknown> = {
    file: filePath,
    language,
    totalLines: lines.length,
    structure: {
      imports: countImports(content, language),
      exports: countExports(content, language),
      functions: symbols.filter((s) => s.kind === 'function').length,
      classes: symbols.filter((s) => s.kind === 'class').length,
      interfaces: symbols.filter((s) => s.kind === 'interface').length,
      types: symbols.filter((s) => s.kind === 'type').length,
    },
    symbols: symbols.slice(0, 50).map((s) => ({
      name: s.name,
      kind: s.kind,
      line: s.startLine,
      signature: s.signature,
    })),
  };

  if (detail === 'brief') {
    result.summary = generateFileSummary(content, symbols, language);
  } else if (detail === 'detailed') {
    result.overview = generateFileOverview(content, symbols, language);
    result.keyComponents = identifyKeyComponents(symbols);
  } else {
    result.overview = generateFileOverview(content, symbols, language);
    result.keyComponents = identifyKeyComponents(symbols);
    result.dependencies = extractDependencies(content, language);
    result.patterns = identifyPatterns(content, language);
  }

  return result;
}

/**
 * Analyze a code section
 */
function analyzeCodeSection(
  code: string,
  symbols: CodeSymbol[],
  language: string,
  detail: string
): Record<string, unknown> {
  const analysis: Record<string, unknown> = {
    linesOfCode: code.split('\n').filter((l) => l.trim()).length,
    hasSymbols: symbols.length > 0,
  };

  if (detail !== 'brief') {
    analysis.complexity = estimateComplexity(code);
    analysis.concepts = identifyRelatedConcepts(code, language);
  }

  return analysis;
}

/**
 * Generate brief summary
 */
function generateBriefSummary(symbol: CodeSymbol, code: string): string {
  const kindName = symbol.kind.charAt(0).toUpperCase() + symbol.kind.slice(1);
  const lineCount = code.split('\n').length;
  return `${kindName} "${symbol.name}" spanning ${lineCount} lines.`;
}

/**
 * Generate detailed explanation
 */
function generateDetailedExplanation(
  symbol: CodeSymbol,
  code: string,
  language: string
): Record<string, unknown> {
  return {
    type: symbol.kind,
    name: symbol.name,
    purpose: inferPurpose(symbol.name, code),
    structure: describeStructure(code, language),
    complexity: estimateComplexity(code),
  };
}

/**
 * Generate comprehensive explanation
 */
function generateComprehensiveExplanation(
  symbol: CodeSymbol,
  code: string,
  language: string
): Record<string, unknown> {
  return {
    ...generateDetailedExplanation(symbol, code, language),
    controlFlow: analyzeControlFlow(code),
    errorHandling: analyzeErrorHandling(code),
    sideEffects: identifySideEffects(code),
  };
}

/**
 * Infer purpose from name and code
 */
function inferPurpose(name: string, code: string): string {
  // Simple heuristics based on naming conventions
  const nameLower = name.toLowerCase();

  if (nameLower.startsWith('get')) {
    return `Retrieves or computes ${name.slice(3)} value`;
  }
  if (nameLower.startsWith('set')) {
    return `Sets or updates ${name.slice(3)} value`;
  }
  if (nameLower.startsWith('is') || nameLower.startsWith('has') || nameLower.startsWith('can')) {
    return `Checks a boolean condition related to ${name}`;
  }
  if (nameLower.startsWith('create') || nameLower.startsWith('make') || nameLower.startsWith('build')) {
    return `Creates or constructs a new ${name.replace(/^(create|make|build)/i, '')} instance`;
  }
  if (nameLower.startsWith('handle') || nameLower.startsWith('on')) {
    return `Event handler for ${name.replace(/^(handle|on)/i, '')} events`;
  }
  if (nameLower.startsWith('parse')) {
    return `Parses ${name.replace(/^parse/i, '')} data`;
  }
  if (nameLower.startsWith('format')) {
    return `Formats ${name.replace(/^format/i, '')} for output`;
  }
  if (nameLower.startsWith('validate')) {
    return `Validates ${name.replace(/^validate/i, '')} input`;
  }
  if (nameLower.startsWith('fetch') || nameLower.startsWith('load')) {
    return `Fetches or loads ${name.replace(/^(fetch|load)/i, '')} data`;
  }
  if (nameLower.startsWith('save') || nameLower.startsWith('store')) {
    return `Persists ${name.replace(/^(save|store)/i, '')} data`;
  }
  if (nameLower.startsWith('delete') || nameLower.startsWith('remove')) {
    return `Removes or deletes ${name.replace(/^(delete|remove)/i, '')}`;
  }
  if (nameLower.startsWith('update')) {
    return `Updates existing ${name.replace(/^update/i, '')}`;
  }
  if (nameLower.includes('init')) {
    return `Initializes ${name.replace(/init/i, '')} component or state`;
  }

  return `Implements ${name} functionality`;
}

/**
 * Describe code structure
 */
function describeStructure(code: string, language: string): string[] {
  const structure: string[] = [];

  if (code.includes('async') || code.includes('await')) {
    structure.push('Uses asynchronous operations');
  }
  if (code.includes('try') || code.includes('catch')) {
    structure.push('Includes error handling');
  }
  if (code.includes('for') || code.includes('while') || code.includes('.map(') || code.includes('.forEach(')) {
    structure.push('Contains iteration logic');
  }
  if (code.includes('if') || code.includes('switch') || code.includes('?')) {
    structure.push('Contains conditional logic');
  }
  if (code.includes('return')) {
    structure.push('Returns a value');
  }
  if (code.includes('throw')) {
    structure.push('May throw exceptions');
  }
  if (code.includes('new ')) {
    structure.push('Creates object instances');
  }

  return structure.length > 0 ? structure : ['Simple sequential logic'];
}

/**
 * Estimate code complexity
 */
function estimateComplexity(code: string): string {
  let complexity = 1;

  // Count branching statements
  complexity += (code.match(/if\s*\(/g) || []).length;
  complexity += (code.match(/else\s+if\s*\(/g) || []).length;
  complexity += (code.match(/switch\s*\(/g) || []).length;
  complexity += (code.match(/case\s+/g) || []).length;
  complexity += (code.match(/\?\s*/g) || []).length;
  complexity += (code.match(/for\s*\(/g) || []).length;
  complexity += (code.match(/while\s*\(/g) || []).length;
  complexity += (code.match(/catch\s*\(/g) || []).length;
  complexity += (code.match(/&&|\|\|/g) || []).length;

  if (complexity <= 3) return 'Low';
  if (complexity <= 7) return 'Medium';
  if (complexity <= 15) return 'High';
  return 'Very High';
}

/**
 * Analyze control flow
 */
function analyzeControlFlow(code: string): string[] {
  const flow: string[] = [];

  if (code.includes('if')) flow.push('Conditional branching');
  if (code.includes('switch')) flow.push('Multi-way branching');
  if (code.includes('for')) flow.push('For loop iteration');
  if (code.includes('while')) flow.push('While loop iteration');
  if (code.includes('break')) flow.push('Loop/switch break');
  if (code.includes('continue')) flow.push('Loop continuation');
  if (code.includes('return')) flow.push('Early return');
  if (code.includes('throw')) flow.push('Exception throwing');

  return flow;
}

/**
 * Analyze error handling
 */
function analyzeErrorHandling(code: string): Record<string, unknown> {
  return {
    hasTryCatch: code.includes('try') && code.includes('catch'),
    throwsExceptions: code.includes('throw'),
    hasFinally: code.includes('finally'),
    errorTypes: extractErrorTypes(code),
  };
}

/**
 * Extract error types from code
 */
function extractErrorTypes(code: string): string[] {
  const errors: string[] = [];
  const matches = code.match(/throw\s+new\s+(\w+)/g);
  if (matches) {
    for (const match of matches) {
      const errorType = match.replace(/throw\s+new\s+/, '');
      if (!errors.includes(errorType)) {
        errors.push(errorType);
      }
    }
  }
  return errors;
}

/**
 * Identify side effects
 */
function identifySideEffects(code: string): string[] {
  const effects: string[] = [];

  if (code.includes('console.')) effects.push('Console output');
  if (code.includes('fs.') || code.includes('readFile') || code.includes('writeFile')) {
    effects.push('File system operations');
  }
  if (code.includes('fetch') || code.includes('axios') || code.includes('http')) {
    effects.push('Network requests');
  }
  if (code.includes('localStorage') || code.includes('sessionStorage')) {
    effects.push('Browser storage access');
  }
  if (code.includes('document.') || code.includes('window.')) {
    effects.push('DOM manipulation');
  }
  if (code.includes('process.env')) {
    effects.push('Environment variable access');
  }
  if (code.includes('setTimeout') || code.includes('setInterval')) {
    effects.push('Timer scheduling');
  }

  return effects;
}

/**
 * Identify related concepts
 */
function identifyRelatedConcepts(code: string, language: string): string[] {
  const concepts: string[] = [];

  if (code.includes('async') || code.includes('Promise')) concepts.push('Asynchronous programming');
  if (code.includes('class')) concepts.push('Object-oriented programming');
  if (code.includes('.map(') || code.includes('.filter(') || code.includes('.reduce(')) {
    concepts.push('Functional programming');
  }
  if (code.includes('interface') || code.includes('type ')) concepts.push('Type definitions');
  if (code.includes('export') || code.includes('import')) concepts.push('Module system');
  if (code.includes('extends') || code.includes('implements')) concepts.push('Inheritance/Implementation');
  if (code.includes('generic') || code.includes('<T>') || code.includes('<T,')) {
    concepts.push('Generics');
  }
  if (code.includes('decorator') || code.includes('@')) concepts.push('Decorators/Annotations');

  return concepts;
}

/**
 * Extract parameters from signature
 */
function extractParameters(signature: string): Array<{ name: string; type?: string }> {
  const params: Array<{ name: string; type?: string }> = [];
  const match = signature.match(/\(([^)]*)\)/);
  if (!match) return params;

  const paramString = match[1];
  if (!paramString.trim()) return params;

  const paramParts = paramString.split(',');
  for (const part of paramParts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // TypeScript style: name: Type
    const tsMatch = trimmed.match(/(\w+)\s*:\s*(.+)/);
    if (tsMatch) {
      params.push({ name: tsMatch[1], type: tsMatch[2].trim() });
    } else {
      // Just name
      const nameMatch = trimmed.match(/(\w+)/);
      if (nameMatch) {
        params.push({ name: nameMatch[1] });
      }
    }
  }

  return params;
}

/**
 * Extract return type from signature
 */
function extractReturnType(signature: string, language: string): string | undefined {
  // TypeScript: function foo(): Type
  const tsMatch = signature.match(/\)\s*:\s*([^{]+)/);
  if (tsMatch) {
    return tsMatch[1].trim();
  }
  return undefined;
}

/**
 * Count imports
 */
function countImports(content: string, language: string): number {
  const patterns: Record<string, RegExp> = {
    typescript: /^import\s/gm,
    javascript: /^import\s|^const\s+\w+\s*=\s*require\(/gm,
    python: /^import\s|^from\s+\w+\s+import/gm,
    go: /^import\s/gm,
    rust: /^use\s/gm,
    java: /^import\s/gm,
    kotlin: /^import\s/gm,
  };

  const pattern = patterns[language] || /^import\s/gm;
  return (content.match(pattern) || []).length;
}

/**
 * Count exports
 */
function countExports(content: string, language: string): number {
  const patterns: Record<string, RegExp> = {
    typescript: /^export\s/gm,
    javascript: /^export\s|module\.exports\s*=/gm,
    python: /^__all__\s*=/gm,
    go: /^func\s+[A-Z]/gm, // Public functions start with uppercase
    rust: /^pub\s/gm,
  };

  const pattern = patterns[language] || /^export\s/gm;
  return (content.match(pattern) || []).length;
}

/**
 * Generate file summary
 */
function generateFileSummary(
  content: string,
  symbols: CodeSymbol[],
  language: string
): string {
  const lines = content.split('\n').length;
  const functions = symbols.filter((s) => s.kind === 'function').length;
  const classes = symbols.filter((s) => s.kind === 'class').length;

  let summary = `${language} file with ${lines} lines`;
  if (functions > 0) summary += `, ${functions} function(s)`;
  if (classes > 0) summary += `, ${classes} class(es)`;
  return summary + '.';
}

/**
 * Generate file overview
 */
function generateFileOverview(
  content: string,
  symbols: CodeSymbol[],
  language: string
): Record<string, unknown> {
  return {
    language,
    size: {
      lines: content.split('\n').length,
      characters: content.length,
    },
    hasAsyncCode: content.includes('async') || content.includes('Promise'),
    hasTests: content.includes('test(') || content.includes('it(') || content.includes('describe('),
    mainPurpose: inferFilePurpose(content, symbols),
  };
}

/**
 * Infer file purpose
 */
function inferFilePurpose(content: string, symbols: CodeSymbol[]): string {
  if (content.includes('test(') || content.includes('it(') || content.includes('describe(')) {
    return 'Test file';
  }
  if (symbols.some((s) => s.kind === 'class')) {
    return 'Class definitions';
  }
  if (content.includes('express') || content.includes('router') || content.includes('/api/')) {
    return 'API/Route handlers';
  }
  if (content.includes('useState') || content.includes('useEffect') || content.includes('React')) {
    return 'React component';
  }
  if (symbols.every((s) => s.kind === 'type' || s.kind === 'interface')) {
    return 'Type definitions';
  }
  if (content.includes('export default')) {
    return 'Module with default export';
  }
  return 'Utility/Helper module';
}

/**
 * Identify key components
 */
function identifyKeyComponents(symbols: CodeSymbol[]): Array<{ name: string; kind: string }> {
  // Prioritize classes, then exported functions, then others
  const sorted = [...symbols].sort((a, b) => {
    const priority: Record<string, number> = {
      class: 0,
      interface: 1,
      function: 2,
      method: 3,
      type: 4,
      variable: 5,
    };
    return (priority[a.kind] || 10) - (priority[b.kind] || 10);
  });

  return sorted.slice(0, 10).map((s) => ({
    name: s.name,
    kind: s.kind,
  }));
}

/**
 * Extract dependencies
 */
function extractDependencies(content: string, language: string): string[] {
  const deps: string[] = [];

  // Extract import statements
  const importMatches = content.match(/import\s+.*?from\s+['"]([^'"]+)['"]/g);
  if (importMatches) {
    for (const match of importMatches) {
      const moduleMatch = match.match(/from\s+['"]([^'"]+)['"]/);
      if (moduleMatch && !moduleMatch[1].startsWith('.')) {
        deps.push(moduleMatch[1]);
      }
    }
  }

  // Extract require statements
  const requireMatches = content.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
  if (requireMatches) {
    for (const match of requireMatches) {
      const moduleMatch = match.match(/['"]([^'"]+)['"]/);
      if (moduleMatch && !moduleMatch[1].startsWith('.')) {
        deps.push(moduleMatch[1]);
      }
    }
  }

  return [...new Set(deps)];
}

/**
 * Identify patterns
 */
function identifyPatterns(content: string, language: string): string[] {
  const patterns: string[] = [];

  if (content.includes('singleton') || content.match(/private\s+static\s+instance/)) {
    patterns.push('Singleton pattern');
  }
  if (content.includes('factory') || content.match(/create\w+\s*\(/)) {
    patterns.push('Factory pattern');
  }
  if (content.includes('observer') || content.includes('subscribe') || content.includes('emit')) {
    patterns.push('Observer/Event pattern');
  }
  if (content.includes('middleware')) {
    patterns.push('Middleware pattern');
  }
  if (content.includes('decorator') || content.match(/@\w+/)) {
    patterns.push('Decorator pattern');
  }
  if (content.includes('builder') || content.match(/\.set\w+\([^)]+\)\s*\./)) {
    patterns.push('Builder pattern');
  }

  return patterns;
}
