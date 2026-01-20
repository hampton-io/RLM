/**
 * File System Utilities for Codebase Indexing
 *
 * Handles file discovery, gitignore parsing, and file operations.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { SupportedLanguage } from '../types.js';
import { detectLanguage, isSupportedFile } from './language.js';

/**
 * Pattern matcher for gitignore-style patterns
 */
export class PatternMatcher {
  private patterns: Array<{
    pattern: string;
    regex: RegExp;
    negated: boolean;
  }> = [];

  constructor(patterns: string[] = []) {
    for (const pattern of patterns) {
      this.addPattern(pattern);
    }
  }

  /**
   * Add a pattern to the matcher
   */
  addPattern(pattern: string): void {
    let negated = false;
    let p = pattern.trim();

    // Skip empty lines and comments
    if (!p || p.startsWith('#')) return;

    // Handle negation
    if (p.startsWith('!')) {
      negated = true;
      p = p.slice(1);
    }

    // Convert gitignore pattern to regex
    const regex = this.patternToRegex(p);
    this.patterns.push({ pattern: p, regex, negated });
  }

  /**
   * Convert gitignore pattern to regex
   */
  private patternToRegex(pattern: string): RegExp {
    let p = pattern;

    // Handle directory-only patterns
    const dirOnly = p.endsWith('/');
    if (dirOnly) {
      p = p.slice(0, -1);
    }

    // Escape special regex characters except * and ?
    p = p.replace(/[.+^${}()|[\]\\]/g, '\\$&');

    // Handle ** (match any path segment)
    p = p.replace(/\*\*/g, '{{GLOBSTAR}}');

    // Handle * (match anything except /)
    p = p.replace(/\*/g, '[^/]*');

    // Handle ? (match single character except /)
    p = p.replace(/\?/g, '[^/]');

    // Restore **
    p = p.replace(/\{\{GLOBSTAR\}\}/g, '.*');

    // Handle patterns that should match at any level
    if (!pattern.includes('/') || pattern.startsWith('**/')) {
      p = `(^|.*/)?${p}`;
    } else if (pattern.startsWith('/')) {
      p = `^${p.slice(1)}`;
    } else {
      p = `^${p}`;
    }

    // Add end anchor or allow subdirectories for directories
    if (dirOnly) {
      p = `${p}(/.*)?$`;
    } else {
      p = `${p}(/.*)?$`;
    }

    return new RegExp(p);
  }

  /**
   * Check if a path matches any pattern
   */
  matches(relativePath: string): boolean {
    // Normalize path separators
    const normalizedPath = relativePath.replace(/\\/g, '/');

    let matched = false;

    for (const { regex, negated } of this.patterns) {
      if (regex.test(normalizedPath)) {
        matched = !negated;
      }
    }

    return matched;
  }
}

/**
 * Load gitignore patterns from a file
 */
export async function loadGitignore(rootPath: string): Promise<PatternMatcher> {
  const matcher = new PatternMatcher();

  // Always ignore .git directory
  matcher.addPattern('.git');
  matcher.addPattern('.git/**');

  try {
    const gitignorePath = path.join(rootPath, '.gitignore');
    const content = await fs.readFile(gitignorePath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      matcher.addPattern(line);
    }
  } catch {
    // No .gitignore file, use defaults
  }

  return matcher;
}

/**
 * File discovery result
 */
export interface DiscoveredFile {
  path: string;
  relativePath: string;
  language: SupportedLanguage;
  size: number;
  lastModified: number;
}

/**
 * File discovery options
 */
export interface DiscoveryOptions {
  ignorePatterns?: string[];
  includePatterns?: string[];
  languages?: SupportedLanguage[];
  maxFileSize?: number;
  respectGitignore?: boolean;
}

/**
 * Discover files in a directory
 */
export async function discoverFiles(
  rootPath: string,
  options: DiscoveryOptions = {}
): Promise<DiscoveredFile[]> {
  const {
    ignorePatterns = [],
    includePatterns = ['**/*'],
    languages,
    maxFileSize = 1024 * 1024,
    respectGitignore = true,
  } = options;

  // Load gitignore if requested
  const gitignore = respectGitignore ? await loadGitignore(rootPath) : new PatternMatcher();

  // Add user-provided ignore patterns
  const ignoreMatcher = new PatternMatcher([...ignorePatterns]);

  // Add include patterns
  const includeMatcher = new PatternMatcher(includePatterns);

  const files: DiscoveredFile[] = [];

  async function scanDirectory(dirPath: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return; // Skip inaccessible directories
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(rootPath, fullPath);

      // Check if ignored
      if (gitignore.matches(relativePath) || ignoreMatcher.matches(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await scanDirectory(fullPath);
      } else if (entry.isFile()) {
        // Check include patterns
        if (!includeMatcher.matches(relativePath)) {
          continue;
        }

        // Check if supported file
        if (!isSupportedFile(fullPath)) {
          continue;
        }

        const language = detectLanguage(fullPath);

        // Check language filter
        if (languages && !languages.includes(language)) {
          continue;
        }

        // Get file stats
        try {
          const stats = await fs.stat(fullPath);

          // Check file size
          if (stats.size > maxFileSize) {
            continue;
          }

          files.push({
            path: fullPath,
            relativePath,
            language,
            size: stats.size,
            lastModified: stats.mtimeMs,
          });
        } catch {
          // Skip inaccessible files
        }
      }
    }
  }

  await scanDirectory(rootPath);
  return files;
}

/**
 * Compute file hash for change detection
 */
export async function computeFileHash(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Read file content with encoding detection
 */
export async function readFileContent(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);

  // Simple UTF-8 detection
  try {
    return buffer.toString('utf-8');
  } catch {
    // Fall back to latin1 for binary-ish files
    return buffer.toString('latin1');
  }
}

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Get relative path from root
 */
export function getRelativePath(rootPath: string, filePath: string): string {
  return path.relative(rootPath, filePath).replace(/\\/g, '/');
}

/**
 * Resolve path to absolute
 */
export function resolveAbsolutePath(rootPath: string, relativePath: string): string {
  return path.resolve(rootPath, relativePath);
}
