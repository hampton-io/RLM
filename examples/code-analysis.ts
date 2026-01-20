/**
 * Code Analysis Example
 *
 * Demonstrates RLM's ability to analyze codebases for:
 * - Security vulnerabilities
 * - Code smells and anti-patterns
 * - Documentation generation
 * - Refactoring opportunities
 *
 * Supports TypeScript, Python, and Go.
 *
 * Run with: npx tsx examples/code-analysis.ts [path] [--language ts|py|go]
 */

import { RLM, analyzeTemplate, render } from '../src/index.js';
import * as fs from 'fs';
import * as path from 'path';

// File extensions by language
const EXTENSIONS: Record<string, string[]> = {
  typescript: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  python: ['.py', '.pyw'],
  go: ['.go'],
};

// Directories to ignore
const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  'vendor',
]);

// File patterns to ignore
const IGNORE_PATTERNS = [
  /\.min\.(js|css)$/,
  /\.d\.ts$/,
  /\.map$/,
  /\.lock$/,
  /package-lock\.json$/,
];

interface CodeFile {
  path: string;
  content: string;
  language: string;
  lines: number;
}

interface AnalysisResult {
  securityIssues: SecurityIssue[];
  codeSmells: CodeSmell[];
  refactoringOpportunities: RefactoringOpportunity[];
  documentation: DocumentationSuggestion[];
  summary: string;
}

interface SecurityIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  file: string;
  line?: number;
  description: string;
  recommendation: string;
}

interface CodeSmell {
  type: string;
  file: string;
  line?: number;
  description: string;
  impact: string;
}

interface RefactoringOpportunity {
  type: string;
  file: string;
  description: string;
  benefit: string;
  effort: 'low' | 'medium' | 'high';
}

interface DocumentationSuggestion {
  file: string;
  element: string;
  suggestion: string;
}

/**
 * Recursively find all code files in a directory.
 */
function findCodeFiles(
  dir: string,
  language: string,
  files: CodeFile[] = []
): CodeFile[] {
  const extensions = EXTENSIONS[language];
  if (!extensions) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        findCodeFiles(fullPath, language, files);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.includes(ext)) {
        // Check ignore patterns
        if (IGNORE_PATTERNS.some((pattern) => pattern.test(entry.name))) {
          continue;
        }

        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n').length;

        files.push({
          path: fullPath,
          content,
          language,
          lines,
        });
      }
    }
  }

  return files;
}

/**
 * Combine code files into a single context for analysis.
 */
function createCodeContext(files: CodeFile[]): string {
  let context = 'CODEBASE ANALYSIS CONTEXT\n';
  context += '='.repeat(80) + '\n\n';

  // Summary
  const totalLines = files.reduce((sum, f) => sum + f.lines, 0);
  context += `Files: ${files.length}\n`;
  context += `Total Lines: ${totalLines.toLocaleString()}\n`;
  context += `Language: ${files[0]?.language || 'unknown'}\n\n`;

  // File list
  context += 'FILE INDEX\n';
  context += '-'.repeat(80) + '\n';
  for (const file of files) {
    context += `- ${file.path} (${file.lines} lines)\n`;
  }
  context += '\n';

  // File contents
  for (const file of files) {
    context += `${'='.repeat(80)}\n`;
    context += `FILE: ${file.path}\n`;
    context += `LINES: ${file.lines}\n`;
    context += `${'='.repeat(80)}\n`;
    context += file.content;
    context += '\n\n';
  }

  return context;
}

/**
 * Generate a markdown report from analysis results.
 */
function generateReport(
  result: AnalysisResult,
  codebasePath: string,
  fileCount: number,
  totalLines: number
): string {
  let report = '# Code Analysis Report\n\n';
  report += `**Codebase:** ${codebasePath}\n`;
  report += `**Files Analyzed:** ${fileCount}\n`;
  report += `**Total Lines:** ${totalLines.toLocaleString()}\n`;
  report += `**Generated:** ${new Date().toISOString()}\n\n`;

  // Summary
  report += '## Summary\n\n';
  report += result.summary + '\n\n';

  // Security Issues
  report += '## Security Issues\n\n';
  if (result.securityIssues.length === 0) {
    report += 'No security issues identified.\n\n';
  } else {
    // Group by severity
    const bySeverity = {
      critical: result.securityIssues.filter((i) => i.severity === 'critical'),
      high: result.securityIssues.filter((i) => i.severity === 'high'),
      medium: result.securityIssues.filter((i) => i.severity === 'medium'),
      low: result.securityIssues.filter((i) => i.severity === 'low'),
    };

    for (const [severity, issues] of Object.entries(bySeverity)) {
      if (issues.length > 0) {
        report += `### ${severity.charAt(0).toUpperCase() + severity.slice(1)} (${issues.length})\n\n`;
        for (const issue of issues) {
          report += `- **${issue.type}** in \`${issue.file}\`${issue.line ? `:${issue.line}` : ''}\n`;
          report += `  - ${issue.description}\n`;
          report += `  - *Recommendation:* ${issue.recommendation}\n\n`;
        }
      }
    }
  }

  // Code Smells
  report += '## Code Smells\n\n';
  if (result.codeSmells.length === 0) {
    report += 'No code smells identified.\n\n';
  } else {
    for (const smell of result.codeSmells) {
      report += `- **${smell.type}** in \`${smell.file}\`${smell.line ? `:${smell.line}` : ''}\n`;
      report += `  - ${smell.description}\n`;
      report += `  - *Impact:* ${smell.impact}\n\n`;
    }
  }

  // Refactoring Opportunities
  report += '## Refactoring Opportunities\n\n';
  if (result.refactoringOpportunities.length === 0) {
    report += 'No refactoring opportunities identified.\n\n';
  } else {
    // Group by effort
    const byEffort = {
      low: result.refactoringOpportunities.filter((r) => r.effort === 'low'),
      medium: result.refactoringOpportunities.filter(
        (r) => r.effort === 'medium'
      ),
      high: result.refactoringOpportunities.filter((r) => r.effort === 'high'),
    };

    for (const [effort, refactors] of Object.entries(byEffort)) {
      if (refactors.length > 0) {
        report += `### ${effort.charAt(0).toUpperCase() + effort.slice(1)} Effort (${refactors.length})\n\n`;
        for (const refactor of refactors) {
          report += `- **${refactor.type}** in \`${refactor.file}\`\n`;
          report += `  - ${refactor.description}\n`;
          report += `  - *Benefit:* ${refactor.benefit}\n\n`;
        }
      }
    }
  }

  // Documentation Suggestions
  report += '## Documentation Suggestions\n\n';
  if (result.documentation.length === 0) {
    report += 'No documentation suggestions.\n\n';
  } else {
    for (const doc of result.documentation) {
      report += `- **${doc.element}** in \`${doc.file}\`\n`;
      report += `  - ${doc.suggestion}\n\n`;
    }
  }

  return report;
}

/**
 * Parse analysis response from LLM into structured result.
 */
function parseAnalysisResponse(response: string): AnalysisResult {
  // Default empty result
  const result: AnalysisResult = {
    securityIssues: [],
    codeSmells: [],
    refactoringOpportunities: [],
    documentation: [],
    summary: '',
  };

  // Try to extract JSON if present
  const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.securityIssues) result.securityIssues = parsed.securityIssues;
      if (parsed.codeSmells) result.codeSmells = parsed.codeSmells;
      if (parsed.refactoringOpportunities)
        result.refactoringOpportunities = parsed.refactoringOpportunities;
      if (parsed.documentation) result.documentation = parsed.documentation;
      if (parsed.summary) result.summary = parsed.summary;
      return result;
    } catch {
      // Continue with text parsing
    }
  }

  // Extract summary (first paragraph or up to first heading)
  const summaryMatch = response.match(/^([\s\S]*?)(?=\n#+|\n\n\*\*|$)/);
  if (summaryMatch) {
    result.summary = summaryMatch[1].trim().slice(0, 500);
  } else {
    result.summary = response.slice(0, 500);
  }

  return result;
}

async function main() {
  console.log('=== Code Analysis Example ===\n');

  // Parse arguments
  const args = process.argv.slice(2);
  let targetPath = '.';
  let language = 'typescript';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--language' && args[i + 1]) {
      language = args[i + 1].toLowerCase();
      if (language === 'ts') language = 'typescript';
      if (language === 'py') language = 'python';
      i++;
    } else if (!args[i].startsWith('--')) {
      targetPath = args[i];
    }
  }

  // Check for API key
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      'Error: Please set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable'
    );
    process.exit(1);
  }

  // Validate path
  if (!fs.existsSync(targetPath)) {
    console.error(`Error: Path not found: ${targetPath}`);
    process.exit(1);
  }

  // Find code files
  console.log(`Scanning ${targetPath} for ${language} files...\n`);
  const files = findCodeFiles(path.resolve(targetPath), language);

  if (files.length === 0) {
    console.error(`Error: No ${language} files found in ${targetPath}`);
    process.exit(1);
  }

  const totalLines = files.reduce((sum, f) => sum + f.lines, 0);
  console.log(`Found ${files.length} files (${totalLines.toLocaleString()} lines)\n`);

  // Create context
  const context = createCodeContext(files);
  console.log(`Context size: ${context.length.toLocaleString()} characters\n`);

  // Create RLM instance
  const rlm = new RLM({
    model: 'gpt-4o-mini',
    verbose: false,
    maxIterations: 20,
    maxDepth: 2,
  });

  // Analysis prompt
  const analysisPrompt = `Analyze this ${language} codebase for:

1. **Security Vulnerabilities**: Look for SQL injection, XSS, command injection, hardcoded secrets, insecure crypto, path traversal, etc.

2. **Code Smells**: Identify long functions, deep nesting, duplicate code, god classes, feature envy, etc.

3. **Refactoring Opportunities**: Find areas that could benefit from extraction, simplification, or pattern application.

4. **Documentation Gaps**: Identify public APIs, complex functions, or unclear code that needs documentation.

Return your findings in this JSON format:
\`\`\`json
{
  "summary": "Brief overall assessment",
  "securityIssues": [
    {"severity": "high|medium|low", "type": "issue type", "file": "path", "line": 123, "description": "...", "recommendation": "..."}
  ],
  "codeSmells": [
    {"type": "smell type", "file": "path", "line": 123, "description": "...", "impact": "..."}
  ],
  "refactoringOpportunities": [
    {"type": "refactoring type", "file": "path", "description": "...", "benefit": "...", "effort": "low|medium|high"}
  ],
  "documentation": [
    {"file": "path", "element": "function/class name", "suggestion": "..."}
  ]
}
\`\`\`

Be thorough but focus on the most significant issues. Prioritize actionable findings.`;

  console.log('Analyzing codebase...\n');
  console.log('=' .repeat(80) + '\n');

  try {
    const startTime = Date.now();
    const result = await rlm.completion(analysisPrompt, context);
    const elapsed = Date.now() - startTime;

    // Parse the response
    const analysis = parseAnalysisResponse(result.response);

    // Generate report
    const report = generateReport(
      analysis,
      targetPath,
      files.length,
      totalLines
    );

    // Output report
    console.log(report);

    // Write report to file
    const reportPath = 'code-analysis-report.md';
    fs.writeFileSync(reportPath, report);
    console.log(`\nReport saved to: ${reportPath}`);

    // Stats
    console.log('\n' + '=' .repeat(80));
    console.log(`Analysis completed in ${(elapsed / 1000).toFixed(1)}s`);
    console.log(`Tokens used: ${result.usage.totalTokens.toLocaleString()}`);
    console.log(`Estimated cost: $${result.usage.estimatedCost.toFixed(4)}`);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

main();
