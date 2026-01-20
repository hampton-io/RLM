/**
 * Analyze Dependencies MCP Tool
 *
 * Analyzes import/export dependencies between files and modules.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  MCPToolDefinition,
  ToolHandler,
  DependencyNode,
} from '../types.js';

/**
 * Tool definition for analyze_dependencies
 */
export const analyzeDependenciesDefinition: MCPToolDefinition = {
  name: 'analyze_dependencies',
  description:
    'Analyze import/export dependencies between files and modules. ' +
    'Detects circular dependencies, unused imports, and dependency graphs.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to analyze (file or directory)',
      },
      depth: {
        type: 'number',
        description: 'Maximum depth to traverse dependencies (default: 3)',
        default: 3,
      },
      includeExternal: {
        type: 'boolean',
        description: 'Include external (node_modules) dependencies',
        default: false,
      },
      detectCircular: {
        type: 'boolean',
        description: 'Detect circular dependencies',
        default: true,
      },
      detectUnused: {
        type: 'boolean',
        description: 'Detect unused imports',
        default: true,
      },
    },
    required: [],
  },
};

/**
 * Analyze dependencies arguments interface
 */
interface AnalyzeDependenciesArgs {
  path?: string;
  depth?: number;
  includeExternal?: boolean;
  detectCircular?: boolean;
  detectUnused?: boolean;
}

/**
 * Import info
 */
interface ImportInfo {
  source: string;
  specifiers: string[];
  isDefault: boolean;
  isNamespace: boolean;
  isType: boolean;
  line: number;
}

/**
 * File dependency info
 */
interface FileDependency {
  file: string;
  imports: ImportInfo[];
  exports: string[];
  importedBy: string[];
}

/**
 * Create analyze_dependencies tool handler
 */
export function createAnalyzeDependenciesHandler(): ToolHandler<AnalyzeDependenciesArgs> {
  return async (args, context) => {
    const {
      path: targetPath,
      depth = 3,
      includeExternal = false,
      detectCircular = true,
      detectUnused = true,
    } = args;

    if (!context.index) {
      return {
        error: 'Codebase has not been indexed. Please run indexing first.',
        suggestion: 'Use the index_codebase tool to index the project.',
      };
    }

    // Build dependency graph
    const dependencyMap = new Map<string, FileDependency>();

    for (const file of context.index.files.values()) {
      // Skip if path filter is specified
      if (targetPath && !file.relativePath.startsWith(targetPath)) {
        continue;
      }

      let content: string;
      try {
        content = await fs.readFile(file.path, 'utf-8');
      } catch {
        continue;
      }

      const imports = extractImports(content, file.language);
      const exports = extractExports(content, file.language);

      dependencyMap.set(file.relativePath, {
        file: file.relativePath,
        imports,
        exports,
        importedBy: [],
      });
    }

    // Build reverse dependency map (importedBy)
    for (const [filePath, dep] of dependencyMap) {
      for (const imp of dep.imports) {
        const resolvedPath = resolveImportPath(filePath, imp.source, context.index.rootPath);
        const target = dependencyMap.get(resolvedPath);
        if (target) {
          target.importedBy.push(filePath);
        }
      }
    }

    // Convert to DependencyNode array
    const nodes: DependencyNode[] = [];
    for (const [filePath, dep] of dependencyMap) {
      nodes.push({
        name: path.basename(filePath),
        path: filePath,
        type: isExternalImport(dep.imports[0]?.source || '') ? 'external' : 'internal',
        imports: dep.imports
          .filter((i) => includeExternal || !isExternalImport(i.source))
          .map((i) => i.source),
        importedBy: dep.importedBy,
        depth: 0,
      });
    }

    // Detect circular dependencies
    let circularDeps: string[][] = [];
    if (detectCircular) {
      circularDeps = findCircularDependencies(dependencyMap);
    }

    // Detect unused imports
    let unusedImports: Array<{ file: string; import: string }> = [];
    if (detectUnused) {
      for (const [filePath, dep] of dependencyMap) {
        let content: string;
        try {
          content = await fs.readFile(
            path.join(context.index.rootPath, filePath),
            'utf-8'
          );
        } catch {
          continue;
        }

        for (const imp of dep.imports) {
          for (const spec of imp.specifiers) {
            if (!isUsedInFile(content, spec, imp.line)) {
              unusedImports.push({
                file: filePath,
                import: spec,
              });
            }
          }
        }
      }
    }

    // Find external dependencies
    const externalDeps = new Set<string>();
    for (const dep of dependencyMap.values()) {
      for (const imp of dep.imports) {
        if (isExternalImport(imp.source)) {
          externalDeps.add(imp.source.split('/')[0]);
        }
      }
    }

    // Calculate statistics
    const stats = {
      totalFiles: dependencyMap.size,
      totalImports: Array.from(dependencyMap.values()).reduce(
        (sum, d) => sum + d.imports.length,
        0
      ),
      totalExports: Array.from(dependencyMap.values()).reduce(
        (sum, d) => sum + d.exports.length,
        0
      ),
      externalDependencies: externalDeps.size,
      circularDependencies: circularDeps.length,
      unusedImports: unusedImports.length,
    };

    // Find most imported files
    const mostImported = Array.from(dependencyMap.entries())
      .sort((a, b) => b[1].importedBy.length - a[1].importedBy.length)
      .slice(0, 10)
      .map(([file, dep]) => ({
        file,
        importCount: dep.importedBy.length,
      }));

    // Find files with most imports
    const mostImports = Array.from(dependencyMap.entries())
      .sort((a, b) => b[1].imports.length - a[1].imports.length)
      .slice(0, 10)
      .map(([file, dep]) => ({
        file,
        importCount: dep.imports.length,
      }));

    return {
      statistics: stats,
      circularDependencies: circularDeps.length > 0 ? circularDeps : null,
      unusedImports: unusedImports.length > 0 ? unusedImports : null,
      externalDependencies: includeExternal ? Array.from(externalDeps) : null,
      mostImportedFiles: mostImported,
      filesWithMostImports: mostImports,
      recommendations: generateRecommendations(circularDeps, unusedImports, stats),
    };
  };
}

/**
 * Extract imports from source code
 */
function extractImports(content: string, language: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ES6 imports
    const es6Match = line.match(
      /import\s+(?:type\s+)?(?:(\{[^}]+\})|(\*\s+as\s+\w+)|(\w+))?\s*(?:,\s*(?:(\{[^}]+\})|(\w+)))?\s*from\s*['"]([^'"]+)['"]/
    );
    if (es6Match) {
      const specifiers: string[] = [];
      let isDefault = false;
      let isNamespace = false;
      const isType = line.includes('import type');

      // Named imports { a, b }
      if (es6Match[1]) {
        const named = es6Match[1]
          .replace(/[{}]/g, '')
          .split(',')
          .map((s) => s.trim().split(/\s+as\s+/).pop()!.trim());
        specifiers.push(...named);
      }
      // Namespace import * as name
      if (es6Match[2]) {
        isNamespace = true;
        specifiers.push(es6Match[2].replace(/\*\s+as\s+/, '').trim());
      }
      // Default import
      if (es6Match[3]) {
        isDefault = true;
        specifiers.push(es6Match[3]);
      }
      // Additional named imports after default
      if (es6Match[4]) {
        const named = es6Match[4]
          .replace(/[{}]/g, '')
          .split(',')
          .map((s) => s.trim().split(/\s+as\s+/).pop()!.trim());
        specifiers.push(...named);
      }
      // Additional default after named
      if (es6Match[5]) {
        specifiers.push(es6Match[5]);
      }

      imports.push({
        source: es6Match[6],
        specifiers: specifiers.filter((s) => s),
        isDefault,
        isNamespace,
        isType,
        line: i + 1,
      });
      continue;
    }

    // Side-effect imports
    const sideEffectMatch = line.match(/import\s+['"]([^'"]+)['"]/);
    if (sideEffectMatch) {
      imports.push({
        source: sideEffectMatch[1],
        specifiers: [],
        isDefault: false,
        isNamespace: false,
        isType: false,
        line: i + 1,
      });
      continue;
    }

    // CommonJS require
    const requireMatch = line.match(
      /(?:const|let|var)\s+(?:(\{[^}]+\})|(\w+))\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/
    );
    if (requireMatch) {
      const specifiers: string[] = [];
      if (requireMatch[1]) {
        const named = requireMatch[1]
          .replace(/[{}]/g, '')
          .split(',')
          .map((s) => s.trim().split(':').pop()!.trim());
        specifiers.push(...named);
      }
      if (requireMatch[2]) {
        specifiers.push(requireMatch[2]);
      }

      imports.push({
        source: requireMatch[3],
        specifiers,
        isDefault: !!requireMatch[2],
        isNamespace: false,
        isType: false,
        line: i + 1,
      });
    }
  }

  return imports;
}

/**
 * Extract exports from source code
 */
function extractExports(content: string, language: string): string[] {
  const exports: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Named exports
    const namedMatch = line.match(/export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/);
    if (namedMatch) {
      exports.push(namedMatch[1]);
      continue;
    }

    // Export list
    const listMatch = line.match(/export\s*\{([^}]+)\}/);
    if (listMatch) {
      const names = listMatch[1].split(',').map((s) => {
        const parts = s.trim().split(/\s+as\s+/);
        return parts[parts.length - 1].trim();
      });
      exports.push(...names);
      continue;
    }

    // Default export
    if (line.match(/export\s+default/)) {
      exports.push('default');
    }
  }

  return exports;
}

/**
 * Resolve import path to file path
 */
function resolveImportPath(fromFile: string, importSource: string, rootPath: string): string {
  if (!importSource.startsWith('.')) {
    return importSource; // External import
  }

  const fromDir = path.dirname(fromFile);
  let resolved = path.normalize(path.join(fromDir, importSource));

  // Try common extensions
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', ''];
  for (const ext of extensions) {
    const withExt = resolved + ext;
    if (resolved.endsWith(ext) || ext === '') {
      return resolved.replace(/\\/g, '/');
    }
  }

  // Try index file
  const indexExtensions = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
  for (const ext of indexExtensions) {
    const withIndex = resolved + ext;
    // Just return the resolved path, we'll check existence elsewhere
  }

  return resolved.replace(/\\/g, '/');
}

/**
 * Check if import is external (node_modules)
 */
function isExternalImport(source: string): boolean {
  return !source.startsWith('.') && !source.startsWith('/');
}

/**
 * Find circular dependencies using DFS
 */
function findCircularDependencies(dependencyMap: Map<string, FileDependency>): string[][] {
  const circular: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(file: string, path: string[]): void {
    if (recursionStack.has(file)) {
      // Found a cycle
      const cycleStart = path.indexOf(file);
      if (cycleStart !== -1) {
        circular.push([...path.slice(cycleStart), file]);
      }
      return;
    }

    if (visited.has(file)) {
      return;
    }

    visited.add(file);
    recursionStack.add(file);

    const dep = dependencyMap.get(file);
    if (dep) {
      for (const imp of dep.imports) {
        const resolvedPath = resolveImportPath(file, imp.source, '');
        if (dependencyMap.has(resolvedPath)) {
          dfs(resolvedPath, [...path, file]);
        }
      }
    }

    recursionStack.delete(file);
  }

  for (const file of dependencyMap.keys()) {
    visited.clear();
    recursionStack.clear();
    dfs(file, []);
  }

  // Remove duplicate cycles
  const uniqueCycles: string[][] = [];
  const seen = new Set<string>();

  for (const cycle of circular) {
    const normalized = [...cycle].sort().join(' -> ');
    if (!seen.has(normalized)) {
      seen.add(normalized);
      uniqueCycles.push(cycle);
    }
  }

  return uniqueCycles;
}

/**
 * Check if an imported identifier is used in the file
 */
function isUsedInFile(content: string, identifier: string, importLine: number): boolean {
  const lines = content.split('\n');
  const pattern = new RegExp(`\\b${escapeRegex(identifier)}\\b`, 'g');

  let usageCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (i === importLine - 1) continue; // Skip import line itself
    const matches = lines[i].match(pattern);
    if (matches) {
      usageCount += matches.length;
    }
  }

  return usageCount > 0;
}

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(
  circularDeps: string[][],
  unusedImports: Array<{ file: string; import: string }>,
  stats: Record<string, number>
): string[] {
  const recommendations: string[] = [];

  if (circularDeps.length > 0) {
    recommendations.push(
      `Found ${circularDeps.length} circular dependency chain(s). Consider refactoring to break these cycles.`
    );
  }

  if (unusedImports.length > 0) {
    recommendations.push(
      `Found ${unusedImports.length} unused import(s). Remove them to improve code cleanliness.`
    );
  }

  if (stats.externalDependencies > 50) {
    recommendations.push(
      'High number of external dependencies. Consider auditing and reducing dependencies.'
    );
  }

  if (stats.totalImports / stats.totalFiles > 10) {
    recommendations.push(
      'High average imports per file. Consider breaking large files into smaller modules.'
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('No major dependency issues detected. Code structure looks healthy.');
  }

  return recommendations;
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
