/**
 * Language Detection and Parsing Utilities
 *
 * Detects programming languages from file extensions and provides
 * language-specific parsing utilities.
 */

import { SupportedLanguage, CodeSymbol, SymbolKind } from '../types.js';
import * as path from 'path';

/**
 * File extension to language mapping
 */
const EXTENSION_MAP: Record<string, SupportedLanguage> = {
  // TypeScript/JavaScript
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',

  // Python
  '.py': 'python',
  '.pyi': 'python',
  '.pyw': 'python',

  // Go
  '.go': 'go',

  // Rust
  '.rs': 'rust',

  // Java/Kotlin
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',

  // C/C++
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',

  // C#
  '.cs': 'csharp',

  // Ruby
  '.rb': 'ruby',
  '.rake': 'ruby',

  // PHP
  '.php': 'php',

  // Swift
  '.swift': 'swift',
};

/**
 * Detect language from file path
 */
export function detectLanguage(filePath: string): SupportedLanguage {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] || 'unknown';
}

/**
 * Check if file is supported
 */
export function isSupportedFile(filePath: string): boolean {
  return detectLanguage(filePath) !== 'unknown';
}

/**
 * Get file extensions for a language
 */
export function getExtensionsForLanguage(language: SupportedLanguage): string[] {
  return Object.entries(EXTENSION_MAP)
    .filter(([_, lang]) => lang === language)
    .map(([ext]) => ext);
}

/**
 * Language-specific comment patterns
 */
interface CommentPatterns {
  single: RegExp[];
  multiStart: RegExp;
  multiEnd: RegExp;
}

const COMMENT_PATTERNS: Record<SupportedLanguage, CommentPatterns> = {
  typescript: {
    single: [/^\s*\/\//],
    multiStart: /\/\*/,
    multiEnd: /\*\//,
  },
  javascript: {
    single: [/^\s*\/\//],
    multiStart: /\/\*/,
    multiEnd: /\*\//,
  },
  python: {
    single: [/^\s*#/],
    multiStart: /'''/,
    multiEnd: /'''/,
  },
  go: {
    single: [/^\s*\/\//],
    multiStart: /\/\*/,
    multiEnd: /\*\//,
  },
  rust: {
    single: [/^\s*\/\//],
    multiStart: /\/\*/,
    multiEnd: /\*\//,
  },
  java: {
    single: [/^\s*\/\//],
    multiStart: /\/\*/,
    multiEnd: /\*\//,
  },
  kotlin: {
    single: [/^\s*\/\//],
    multiStart: /\/\*/,
    multiEnd: /\*\//,
  },
  c: {
    single: [/^\s*\/\//],
    multiStart: /\/\*/,
    multiEnd: /\*\//,
  },
  cpp: {
    single: [/^\s*\/\//],
    multiStart: /\/\*/,
    multiEnd: /\*\//,
  },
  csharp: {
    single: [/^\s*\/\//],
    multiStart: /\/\*/,
    multiEnd: /\*\//,
  },
  ruby: {
    single: [/^\s*#/],
    multiStart: /=begin/,
    multiEnd: /=end/,
  },
  php: {
    single: [/^\s*\/\//, /^\s*#/],
    multiStart: /\/\*/,
    multiEnd: /\*\//,
  },
  swift: {
    single: [/^\s*\/\//],
    multiStart: /\/\*/,
    multiEnd: /\*\//,
  },
  unknown: {
    single: [/^\s*\/\//, /^\s*#/],
    multiStart: /\/\*/,
    multiEnd: /\*\//,
  },
};

/**
 * Get comment patterns for a language
 */
export function getCommentPatterns(language: SupportedLanguage): CommentPatterns {
  return COMMENT_PATTERNS[language] || COMMENT_PATTERNS.unknown;
}

/**
 * Simple symbol extraction patterns for each language
 */
interface SymbolPattern {
  kind: SymbolKind;
  pattern: RegExp;
  nameGroup: number;
  signatureGroup?: number;
}

const SYMBOL_PATTERNS: Record<SupportedLanguage, SymbolPattern[]> = {
  typescript: [
    { kind: 'function', pattern: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/m, nameGroup: 1 },
    {
      kind: 'function',
      pattern: /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?:=>|:)/m,
      nameGroup: 1,
    },
    { kind: 'class', pattern: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/m, nameGroup: 1 },
    { kind: 'interface', pattern: /^(?:export\s+)?interface\s+(\w+)/m, nameGroup: 1 },
    { kind: 'type', pattern: /^(?:export\s+)?type\s+(\w+)/m, nameGroup: 1 },
    { kind: 'enum', pattern: /^(?:export\s+)?enum\s+(\w+)/m, nameGroup: 1 },
    { kind: 'variable', pattern: /^(?:export\s+)?(?:const|let|var)\s+(\w+)/m, nameGroup: 1 },
  ],
  javascript: [
    { kind: 'function', pattern: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/m, nameGroup: 1 },
    {
      kind: 'function',
      pattern: /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/m,
      nameGroup: 1,
    },
    { kind: 'class', pattern: /^(?:export\s+)?class\s+(\w+)/m, nameGroup: 1 },
    { kind: 'variable', pattern: /^(?:export\s+)?(?:const|let|var)\s+(\w+)/m, nameGroup: 1 },
  ],
  python: [
    { kind: 'function', pattern: /^(?:async\s+)?def\s+(\w+)/m, nameGroup: 1 },
    { kind: 'class', pattern: /^class\s+(\w+)/m, nameGroup: 1 },
    { kind: 'variable', pattern: /^(\w+)\s*=/m, nameGroup: 1 },
  ],
  go: [
    { kind: 'function', pattern: /^func\s+(\w+)/m, nameGroup: 1 },
    { kind: 'method', pattern: /^func\s+\([^)]+\)\s+(\w+)/m, nameGroup: 1 },
    { kind: 'type', pattern: /^type\s+(\w+)\s+(?:struct|interface)/m, nameGroup: 1 },
    { kind: 'variable', pattern: /^var\s+(\w+)/m, nameGroup: 1 },
    { kind: 'constant', pattern: /^const\s+(\w+)/m, nameGroup: 1 },
  ],
  rust: [
    { kind: 'function', pattern: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/m, nameGroup: 1 },
    { kind: 'type', pattern: /^(?:pub\s+)?struct\s+(\w+)/m, nameGroup: 1 },
    { kind: 'type', pattern: /^(?:pub\s+)?enum\s+(\w+)/m, nameGroup: 1 },
    { kind: 'interface', pattern: /^(?:pub\s+)?trait\s+(\w+)/m, nameGroup: 1 },
    { kind: 'type', pattern: /^(?:pub\s+)?type\s+(\w+)/m, nameGroup: 1 },
    { kind: 'constant', pattern: /^(?:pub\s+)?const\s+(\w+)/m, nameGroup: 1 },
    { kind: 'module', pattern: /^(?:pub\s+)?mod\s+(\w+)/m, nameGroup: 1 },
  ],
  java: [
    {
      kind: 'class',
      pattern: /^(?:public\s+)?(?:abstract\s+)?class\s+(\w+)/m,
      nameGroup: 1,
    },
    { kind: 'interface', pattern: /^(?:public\s+)?interface\s+(\w+)/m, nameGroup: 1 },
    { kind: 'enum', pattern: /^(?:public\s+)?enum\s+(\w+)/m, nameGroup: 1 },
    {
      kind: 'method',
      pattern: /^\s+(?:public|private|protected)?\s*(?:static\s+)?[\w<>\[\]]+\s+(\w+)\s*\(/m,
      nameGroup: 1,
    },
  ],
  kotlin: [
    {
      kind: 'class',
      pattern: /^(?:open\s+|abstract\s+)?class\s+(\w+)/m,
      nameGroup: 1,
    },
    { kind: 'interface', pattern: /^interface\s+(\w+)/m, nameGroup: 1 },
    { kind: 'function', pattern: /^(?:suspend\s+)?fun\s+(\w+)/m, nameGroup: 1 },
    { kind: 'variable', pattern: /^(?:val|var)\s+(\w+)/m, nameGroup: 1 },
  ],
  c: [
    {
      kind: 'function',
      pattern: /^(?:static\s+)?[\w\s*]+\s+(\w+)\s*\([^)]*\)\s*\{/m,
      nameGroup: 1,
    },
    { kind: 'type', pattern: /^typedef\s+struct\s+\w*\s*\{[^}]*\}\s*(\w+)/m, nameGroup: 1 },
    { kind: 'type', pattern: /^struct\s+(\w+)/m, nameGroup: 1 },
  ],
  cpp: [
    { kind: 'class', pattern: /^class\s+(\w+)/m, nameGroup: 1 },
    { kind: 'type', pattern: /^struct\s+(\w+)/m, nameGroup: 1 },
    {
      kind: 'function',
      pattern: /^(?:virtual\s+)?[\w\s*&]+\s+(\w+)\s*\([^)]*\)(?:\s*const)?(?:\s*override)?\s*\{/m,
      nameGroup: 1,
    },
    { kind: 'namespace', pattern: /^namespace\s+(\w+)/m, nameGroup: 1 },
  ],
  csharp: [
    { kind: 'class', pattern: /^(?:public\s+)?(?:partial\s+)?class\s+(\w+)/m, nameGroup: 1 },
    { kind: 'interface', pattern: /^(?:public\s+)?interface\s+(\w+)/m, nameGroup: 1 },
    { kind: 'type', pattern: /^(?:public\s+)?struct\s+(\w+)/m, nameGroup: 1 },
    { kind: 'enum', pattern: /^(?:public\s+)?enum\s+(\w+)/m, nameGroup: 1 },
    { kind: 'namespace', pattern: /^namespace\s+(\w+)/m, nameGroup: 1 },
  ],
  ruby: [
    { kind: 'class', pattern: /^class\s+(\w+)/m, nameGroup: 1 },
    { kind: 'module', pattern: /^module\s+(\w+)/m, nameGroup: 1 },
    { kind: 'method', pattern: /^\s*def\s+(\w+)/m, nameGroup: 1 },
  ],
  php: [
    { kind: 'class', pattern: /^(?:abstract\s+)?class\s+(\w+)/m, nameGroup: 1 },
    { kind: 'interface', pattern: /^interface\s+(\w+)/m, nameGroup: 1 },
    { kind: 'interface', pattern: /^trait\s+(\w+)/m, nameGroup: 1 },
    { kind: 'function', pattern: /^(?:public\s+|private\s+|protected\s+)?function\s+(\w+)/m, nameGroup: 1 },
  ],
  swift: [
    { kind: 'class', pattern: /^(?:public\s+|private\s+)?class\s+(\w+)/m, nameGroup: 1 },
    { kind: 'type', pattern: /^(?:public\s+|private\s+)?struct\s+(\w+)/m, nameGroup: 1 },
    { kind: 'enum', pattern: /^(?:public\s+|private\s+)?enum\s+(\w+)/m, nameGroup: 1 },
    { kind: 'interface', pattern: /^(?:public\s+|private\s+)?protocol\s+(\w+)/m, nameGroup: 1 },
    { kind: 'function', pattern: /^(?:public\s+|private\s+)?func\s+(\w+)/m, nameGroup: 1 },
  ],
  unknown: [],
};

/**
 * Extract symbols from source code using regex patterns
 * This is a simple approach - for production, use a proper parser
 */
export function extractSymbols(content: string, language: SupportedLanguage): CodeSymbol[] {
  const patterns = SYMBOL_PATTERNS[language] || [];
  const symbols: CodeSymbol[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const { kind, pattern, nameGroup } of patterns) {
      const match = line.match(pattern);
      if (match && match[nameGroup]) {
        // Find the end of this symbol (simple heuristic based on braces/indentation)
        const endLine = findSymbolEnd(lines, i, language);

        symbols.push({
          name: match[nameGroup],
          kind,
          startLine: i + 1,
          endLine: endLine + 1,
          signature: line.trim(),
        });
      }
    }
  }

  return symbols;
}

/**
 * Find the end line of a symbol (simple brace/indentation matching)
 */
function findSymbolEnd(lines: string[], startLine: number, language: SupportedLanguage): number {
  const startIndent = getIndentation(lines[startLine]);

  // For Python, use indentation
  if (language === 'python') {
    for (let i = startLine + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '') continue;
      const indent = getIndentation(line);
      if (indent <= startIndent && line.trim() !== '') {
        return i - 1;
      }
    }
    return lines.length - 1;
  }

  // For brace-based languages, count braces
  let braceCount = 0;
  let foundOpenBrace = false;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];

    for (const char of line) {
      if (char === '{') {
        braceCount++;
        foundOpenBrace = true;
      } else if (char === '}') {
        braceCount--;
      }
    }

    if (foundOpenBrace && braceCount === 0) {
      return i;
    }
  }

  // Fallback: return next 20 lines or end of file
  return Math.min(startLine + 20, lines.length - 1);
}

/**
 * Get indentation level (number of leading spaces/tabs)
 */
function getIndentation(line: string): number {
  const match = line.match(/^(\s*)/);
  if (!match) return 0;
  // Count tabs as 4 spaces
  return match[1].replace(/\t/g, '    ').length;
}

/**
 * Check if a line is a comment
 */
export function isComment(line: string, language: SupportedLanguage): boolean {
  const patterns = getCommentPatterns(language);
  return patterns.single.some((p) => p.test(line));
}

/**
 * Extract documentation comment above a line
 */
export function extractDocComment(
  lines: string[],
  lineIndex: number,
  language: SupportedLanguage
): string | undefined {
  const patterns = getCommentPatterns(language);
  const docLines: string[] = [];

  // Look backwards for comments
  for (let i = lineIndex - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line === '') continue;

    // Check for single-line comments
    if (patterns.single.some((p) => p.test(line))) {
      docLines.unshift(line.replace(/^\s*\/\/\s?|^\s*#\s?/, ''));
    } else if (patterns.multiEnd.test(line) && !patterns.multiStart.test(line)) {
      // Start of multi-line comment (going backwards)
      docLines.unshift(line.replace(patterns.multiEnd, '').trim());
      // Continue collecting until we find the start
      for (let j = i - 1; j >= 0; j--) {
        const commentLine = lines[j].trim();
        if (patterns.multiStart.test(commentLine)) {
          docLines.unshift(commentLine.replace(patterns.multiStart, '').replace(/^\s*\*\s?/, '').trim());
          break;
        }
        docLines.unshift(commentLine.replace(/^\s*\*\s?/, ''));
      }
      break;
    } else {
      // Non-comment line, stop looking
      break;
    }
  }

  return docLines.length > 0 ? docLines.join('\n').trim() : undefined;
}

/**
 * Get language display name
 */
export function getLanguageDisplayName(language: SupportedLanguage): string {
  const names: Record<SupportedLanguage, string> = {
    typescript: 'TypeScript',
    javascript: 'JavaScript',
    python: 'Python',
    go: 'Go',
    rust: 'Rust',
    java: 'Java',
    kotlin: 'Kotlin',
    c: 'C',
    cpp: 'C++',
    csharp: 'C#',
    ruby: 'Ruby',
    php: 'PHP',
    swift: 'Swift',
    unknown: 'Unknown',
  };
  return names[language];
}
