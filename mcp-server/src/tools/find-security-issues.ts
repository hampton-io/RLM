/**
 * Find Security Issues MCP Tool
 *
 * Scans codebase for common security vulnerabilities including:
 * - Hardcoded secrets (API keys, passwords, tokens)
 * - SQL injection vulnerabilities
 * - XSS vulnerabilities
 * - Command injection
 * - Path traversal
 * - Unsafe eval usage
 */

import { readFile } from 'fs/promises';
import {
  MCPToolDefinition,
  ToolHandler,
  ToolContext,
  SecurityIssue,
} from '../types.js';

// =============================================================================
// Types
// =============================================================================

interface FindSecurityIssuesArgs {
  path?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical' | 'all';
  categories?: string[];
  limit?: number;
}

interface SecurityPattern {
  name: string;
  pattern: RegExp;
  severity: SecurityIssue['severity'];
  category: string;
  description: string;
  recommendation: string;
}

// =============================================================================
// Security Patterns
// =============================================================================

const SECURITY_PATTERNS: SecurityPattern[] = [
  // Hardcoded Secrets
  {
    name: 'hardcoded-api-key',
    pattern: /(api[_-]?key|apikey)\s*[:=]\s*['"][^'"]{10,}['"]/gi,
    severity: 'high',
    category: 'secrets',
    description: 'Hardcoded API key detected',
    recommendation: 'Move API keys to environment variables or a secure secrets manager',
  },
  {
    name: 'hardcoded-password',
    pattern: /(password|passwd|pwd)\s*[:=]\s*['"][^'"]+['"]/gi,
    severity: 'critical',
    category: 'secrets',
    description: 'Hardcoded password detected',
    recommendation: 'Never hardcode passwords. Use environment variables or a secrets manager',
  },
  {
    name: 'hardcoded-secret',
    pattern: /(secret|token|auth)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
    severity: 'high',
    category: 'secrets',
    description: 'Potential hardcoded secret or token detected',
    recommendation: 'Move secrets to environment variables or a secure secrets manager',
  },
  {
    name: 'aws-access-key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    severity: 'critical',
    category: 'secrets',
    description: 'AWS Access Key ID detected',
    recommendation: 'Remove AWS credentials from code and use IAM roles or environment variables',
  },
  {
    name: 'private-key',
    pattern: /-----BEGIN\s+(RSA|DSA|EC|OPENSSH|PGP)\s+PRIVATE\s+KEY-----/g,
    severity: 'critical',
    category: 'secrets',
    description: 'Private key detected in code',
    recommendation: 'Never commit private keys. Use a secrets manager or key vault',
  },

  // SQL Injection
  {
    name: 'sql-injection-concat',
    pattern: /(\$\{[^}]+\}|'\s*\+\s*\w+\s*\+\s*'|"\s*\+\s*\w+\s*\+\s*")[^"']*(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)/gi,
    severity: 'critical',
    category: 'injection',
    description: 'Potential SQL injection vulnerability - string concatenation in query',
    recommendation: 'Use parameterized queries or prepared statements instead of string concatenation',
  },
  {
    name: 'sql-injection-template',
    pattern: /(?:query|execute|exec)\s*\(\s*`[^`]*\$\{/gi,
    severity: 'critical',
    category: 'injection',
    description: 'Potential SQL injection vulnerability - template literal in query',
    recommendation: 'Use parameterized queries instead of template literals for SQL',
  },

  // XSS
  {
    name: 'xss-innerhtml',
    pattern: /\.innerHTML\s*=/g,
    severity: 'high',
    category: 'xss',
    description: 'Potential XSS via innerHTML assignment',
    recommendation: 'Use textContent or a DOM manipulation library with built-in XSS protection',
  },
  {
    name: 'xss-dangerouslysetinnerhtml',
    pattern: /dangerouslySetInnerHTML/g,
    severity: 'high',
    category: 'xss',
    description: 'Potential XSS via React dangerouslySetInnerHTML',
    recommendation: 'Avoid dangerouslySetInnerHTML. If necessary, sanitize input with DOMPurify',
  },
  {
    name: 'xss-document-write',
    pattern: /document\.write\s*\(/g,
    severity: 'high',
    category: 'xss',
    description: 'Potential XSS via document.write',
    recommendation: 'Avoid document.write. Use DOM manipulation methods instead',
  },
  {
    name: 'xss-outerhtml',
    pattern: /\.outerHTML\s*=/g,
    severity: 'high',
    category: 'xss',
    description: 'Potential XSS via outerHTML assignment',
    recommendation: 'Use safer DOM manipulation methods',
  },

  // Code Execution
  {
    name: 'unsafe-eval',
    pattern: /\beval\s*\(/g,
    severity: 'high',
    category: 'code-execution',
    description: 'Unsafe eval() usage detected',
    recommendation: 'Avoid eval(). Use safer alternatives like JSON.parse() for JSON data',
  },
  {
    name: 'unsafe-function-constructor',
    pattern: /new\s+Function\s*\(/g,
    severity: 'high',
    category: 'code-execution',
    description: 'Unsafe Function constructor usage',
    recommendation: 'Avoid new Function(). It is similar to eval() and poses security risks',
  },
  {
    name: 'unsafe-settimeout-string',
    pattern: /setTimeout\s*\(\s*['"`]/g,
    severity: 'medium',
    category: 'code-execution',
    description: 'setTimeout with string argument (acts like eval)',
    recommendation: 'Pass a function to setTimeout instead of a string',
  },

  // Command Injection
  {
    name: 'command-injection-exec',
    pattern: /(?:exec|execSync|spawn|spawnSync)\s*\([^)]*\$\{/g,
    severity: 'critical',
    category: 'injection',
    description: 'Potential command injection via exec with template literal',
    recommendation: 'Never interpolate user input into shell commands. Use parameterized APIs',
  },
  {
    name: 'command-injection-shell',
    pattern: /(?:exec|execSync)\s*\(/g,
    severity: 'medium',
    category: 'injection',
    description: 'Shell command execution detected (review for user input)',
    recommendation: 'Ensure no user input is passed to shell commands without sanitization',
  },

  // Path Traversal
  {
    name: 'path-traversal',
    pattern: /(?:readFile|writeFile|unlink|rmdir|mkdir|access|stat|open)\s*\([^)]*(?:\+|`)/g,
    severity: 'high',
    category: 'path-traversal',
    description: 'Potential path traversal vulnerability',
    recommendation: 'Validate and sanitize file paths. Use path.resolve() and check against allowed directories',
  },

  // Insecure Crypto
  {
    name: 'weak-crypto-md5',
    pattern: /createHash\s*\(\s*['"]md5['"]\s*\)/g,
    severity: 'medium',
    category: 'crypto',
    description: 'Weak hash algorithm MD5 detected',
    recommendation: 'Use a stronger hash algorithm like SHA-256 or SHA-3',
  },
  {
    name: 'weak-crypto-sha1',
    pattern: /createHash\s*\(\s*['"]sha1['"]\s*\)/g,
    severity: 'medium',
    category: 'crypto',
    description: 'Weak hash algorithm SHA1 detected',
    recommendation: 'Use a stronger hash algorithm like SHA-256 or SHA-3',
  },
  {
    name: 'insecure-random',
    pattern: /Math\.random\s*\(\)/g,
    severity: 'low',
    category: 'crypto',
    description: 'Math.random() is not cryptographically secure',
    recommendation: 'Use crypto.randomBytes() or crypto.randomUUID() for security-sensitive random values',
  },

  // Miscellaneous
  {
    name: 'hardcoded-ip',
    pattern: /['"](?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)['"]/g,
    severity: 'low',
    category: 'config',
    description: 'Hardcoded IP address detected',
    recommendation: 'Move IP addresses to configuration files or environment variables',
  },
  {
    name: 'debug-statement',
    pattern: /console\.(log|debug|trace)\s*\([^)]*(?:password|secret|token|key|credential)/gi,
    severity: 'medium',
    category: 'logging',
    description: 'Potential sensitive data in debug output',
    recommendation: 'Remove debug statements that may expose sensitive information',
  },
  {
    name: 'cors-allow-all',
    pattern: /Access-Control-Allow-Origin['":\s]+['"]\*['"]/g,
    severity: 'medium',
    category: 'config',
    description: 'CORS allows all origins',
    recommendation: 'Restrict CORS to specific trusted domains',
  },
];

// =============================================================================
// Tool Definition
// =============================================================================

export const findSecurityIssuesDefinition: MCPToolDefinition = {
  name: 'find_security_issues',
  description:
    'Scan the codebase for common security vulnerabilities including hardcoded secrets, ' +
    'SQL injection, XSS, command injection, and unsafe code patterns.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to scan (default: entire indexed codebase)',
      },
      severity: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical', 'all'],
        default: 'all',
        description: 'Filter by minimum severity level',
      },
      categories: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by categories: secrets, injection, xss, code-execution, path-traversal, crypto, config, logging',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of issues to return (default: 50)',
        default: 50,
      },
    },
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

const SEVERITY_ORDER: Record<SecurityIssue['severity'], number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function shouldIncludeSeverity(
  issueSeverity: SecurityIssue['severity'],
  minSeverity: string | undefined
): boolean {
  if (!minSeverity || minSeverity === 'all') return true;
  return SEVERITY_ORDER[issueSeverity] >= SEVERITY_ORDER[minSeverity as SecurityIssue['severity']];
}

function isTestFile(filePath: string): boolean {
  const testPatterns = [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /__tests__\//,
    /\/test\//,
    /\/tests\//,
    /_test\.[jt]sx?$/,
    /_spec\.[jt]sx?$/,
  ];
  return testPatterns.some((pattern) => pattern.test(filePath));
}

// =============================================================================
// Tool Handler
// =============================================================================

export const findSecurityIssuesHandler: ToolHandler<FindSecurityIssuesArgs, { issues: SecurityIssue[]; summary: Record<string, number> }> = async (
  args,
  context: ToolContext
) => {
  const { path: targetPath, severity, categories, limit = 50 } = args;

  if (!context.index) {
    throw new Error('Codebase has not been indexed. Please run indexing first.');
  }

  const issues: SecurityIssue[] = [];

  // Get files to scan
  const filesToScan: Array<{ path: string; relativePath: string }> = [];

  for (const [filePath, file] of context.index.files) {
    // Skip if path filter is set and doesn't match
    if (targetPath && !filePath.includes(targetPath)) continue;

    // Skip test files (they often have intentional security "issues" for testing)
    if (isTestFile(filePath)) continue;

    filesToScan.push({
      path: filePath,
      relativePath: file.relativePath,
    });
  }

  // Scan each file
  for (const file of filesToScan) {
    try {
      const content = await readFile(file.path, 'utf-8');
      const lines = content.split('\n');

      for (const pattern of SECURITY_PATTERNS) {
        // Skip if category filter is set and doesn't match
        if (categories && categories.length > 0 && !categories.includes(pattern.category)) {
          continue;
        }

        // Skip if severity filter doesn't match
        if (!shouldIncludeSeverity(pattern.severity, severity)) {
          continue;
        }

        // Reset regex lastIndex for global patterns
        pattern.pattern.lastIndex = 0;

        // Search line by line
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          pattern.pattern.lastIndex = 0;

          if (pattern.pattern.test(line)) {
            // Avoid duplicates (same file, same line, same pattern)
            const isDuplicate = issues.some(
              (issue) =>
                issue.file === file.relativePath &&
                issue.line === i + 1 &&
                issue.type === pattern.name
            );

            if (!isDuplicate) {
              issues.push({
                type: pattern.name,
                severity: pattern.severity,
                file: file.relativePath,
                line: i + 1,
                code: line.trim().substring(0, 200),
                description: pattern.description,
                recommendation: pattern.recommendation,
              });
            }
          }
        }
      }
    } catch (error) {
      // Skip files that can't be read
      continue;
    }
  }

  // Sort by severity (critical first) then by file
  issues.sort((a, b) => {
    const severityDiff = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.file.localeCompare(b.file);
  });

  // Apply limit
  const limitedIssues = issues.slice(0, limit);

  // Generate summary
  const summary: Record<string, number> = {
    total: issues.length,
    critical: issues.filter((i) => i.severity === 'critical').length,
    high: issues.filter((i) => i.severity === 'high').length,
    medium: issues.filter((i) => i.severity === 'medium').length,
    low: issues.filter((i) => i.severity === 'low').length,
  };

  return {
    issues: limitedIssues,
    summary,
    ...(issues.length > limit && { note: `Showing ${limit} of ${issues.length} issues. Use the limit parameter to see more.` }),
  };
};
