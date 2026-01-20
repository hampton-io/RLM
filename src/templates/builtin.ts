/**
 * Built-in Prompt Templates
 *
 * Pre-built templates for common RLM use cases.
 */

import type { PromptTemplate } from './types.js';

/**
 * Summarization template.
 */
export const summarizeTemplate: PromptTemplate = {
  id: 'summarize',
  name: 'Summarize',
  description: 'Summarize a document or text, extracting key points and main ideas.',
  category: 'summarization',
  template: `Summarize the following {{documentType}}.

{{#if maxLength}}
Keep the summary to approximately {{maxLength}}.
{{/if}}

{{#if focus}}
Focus particularly on: {{focus}}
{{/if}}

{{#if format}}
Format the summary as: {{format}}
{{/if}}

Provide a clear, concise summary that captures the essential information.`,
  variables: [
    {
      name: 'documentType',
      description: 'Type of document (e.g., article, report, transcript)',
      required: false,
      default: 'content',
      example: 'research paper',
    },
    {
      name: 'maxLength',
      description: 'Target length for the summary',
      required: false,
      example: '500 words',
    },
    {
      name: 'focus',
      description: 'Specific aspects to focus on',
      required: false,
      example: 'technical details',
    },
    {
      name: 'format',
      description: 'Output format (e.g., bullet points, paragraph)',
      required: false,
      default: 'paragraph',
      example: 'bullet points',
    },
  ],
  example: {
    variables: {
      documentType: 'research paper',
      maxLength: '300 words',
      format: 'bullet points',
    },
    expectedOutput: 'A bulleted summary of the key findings and methodology.',
  },
  tags: ['summary', 'condense', 'overview', 'tldr'],
};

/**
 * Data extraction template.
 */
export const extractTemplate: PromptTemplate = {
  id: 'extract',
  name: 'Extract Data',
  description: 'Extract structured data from unstructured text into a specified format.',
  category: 'extraction',
  template: `Extract the following information from the context:

{{fields}}

{{#if outputFormat}}
Output the extracted data as {{outputFormat}}.
{{/if}}

{{#if instructions}}
Additional instructions: {{instructions}}
{{/if}}

If a field cannot be found, indicate it as "Not found" or null.`,
  variables: [
    {
      name: 'fields',
      description: 'List of fields/data points to extract',
      required: true,
      example: '- Name\n- Email\n- Phone number\n- Company',
    },
    {
      name: 'outputFormat',
      description: 'Desired output format',
      required: false,
      default: 'JSON',
      example: 'JSON',
    },
    {
      name: 'instructions',
      description: 'Additional extraction instructions',
      required: false,
      example: 'Include all email addresses found',
    },
  ],
  example: {
    variables: {
      fields: '- Name\n- Email address\n- Phone number',
      outputFormat: 'JSON',
    },
    expectedOutput: '{"name": "John Doe", "email": "john@example.com", "phone": "555-1234"}',
  },
  tags: ['extract', 'data', 'structured', 'json', 'parse'],
};

/**
 * Analysis template.
 */
export const analyzeTemplate: PromptTemplate = {
  id: 'analyze',
  name: 'Deep Analysis',
  description: 'Perform in-depth analysis of content, identifying patterns, insights, and implications.',
  category: 'analysis',
  template: `Perform a comprehensive analysis of the provided {{contentType}}.

{{#if aspects}}
Focus on these aspects:
{{aspects}}
{{/if}}

{{#if perspective}}
Analyze from the perspective of: {{perspective}}
{{/if}}

{{#if depth}}
Analysis depth: {{depth}}
{{/if}}

Provide:
1. Key findings and observations
2. Patterns or themes identified
3. Implications or conclusions
4. Recommendations (if applicable)`,
  variables: [
    {
      name: 'contentType',
      description: 'Type of content being analyzed',
      required: false,
      default: 'content',
      example: 'source code',
    },
    {
      name: 'aspects',
      description: 'Specific aspects to analyze',
      required: false,
      example: '- Code quality\n- Security vulnerabilities\n- Performance',
    },
    {
      name: 'perspective',
      description: 'Perspective to analyze from',
      required: false,
      example: 'security researcher',
    },
    {
      name: 'depth',
      description: 'How deep the analysis should go',
      required: false,
      default: 'thorough',
      example: 'surface-level',
    },
  ],
  example: {
    variables: {
      contentType: 'business report',
      aspects: '- Financial performance\n- Market trends\n- Risk factors',
      depth: 'comprehensive',
    },
    expectedOutput: 'Detailed analysis with findings, patterns, and recommendations.',
  },
  tags: ['analyze', 'deep-dive', 'insights', 'patterns', 'review'],
};

/**
 * Comparison template.
 */
export const compareTemplate: PromptTemplate = {
  id: 'compare',
  name: 'Compare',
  description: 'Compare and contrast multiple items, documents, or concepts.',
  category: 'comparison',
  template: `Compare the following {{itemType}}:

{{items}}

{{#if criteria}}
Compare based on these criteria:
{{criteria}}
{{/if}}

{{#if format}}
Present the comparison as: {{format}}
{{/if}}

Provide:
1. Similarities
2. Differences
3. Relative strengths and weaknesses
4. Overall assessment or recommendation`,
  variables: [
    {
      name: 'itemType',
      description: 'Type of items being compared',
      required: false,
      default: 'items',
      example: 'programming languages',
    },
    {
      name: 'items',
      description: 'List of items to compare',
      required: true,
      example: '1. Python\n2. JavaScript\n3. Rust',
    },
    {
      name: 'criteria',
      description: 'Criteria for comparison',
      required: false,
      example: '- Performance\n- Ease of learning\n- Ecosystem',
    },
    {
      name: 'format',
      description: 'Output format for comparison',
      required: false,
      default: 'structured analysis',
      example: 'comparison table',
    },
  ],
  example: {
    variables: {
      itemType: 'cloud providers',
      items: '1. AWS\n2. Google Cloud\n3. Azure',
      criteria: '- Pricing\n- Services offered\n- Developer experience',
      format: 'comparison table',
    },
    expectedOutput: 'A table comparing the cloud providers across the specified criteria.',
  },
  tags: ['compare', 'contrast', 'versus', 'difference', 'similarity'],
};

/**
 * Search/Find template.
 */
export const searchTemplate: PromptTemplate = {
  id: 'search',
  name: 'Search & Find',
  description: 'Search for specific information, patterns, or items within the context.',
  category: 'search',
  template: `Search the context for: {{query}}

{{#if type}}
Looking for: {{type}}
{{/if}}

{{#if filters}}
Apply these filters:
{{filters}}
{{/if}}

{{#if maxResults}}
Return up to {{maxResults}} results.
{{/if}}

For each match found, provide:
- The exact match or relevant excerpt
- Location/context where it was found
- Any relevant surrounding information`,
  variables: [
    {
      name: 'query',
      description: 'What to search for',
      required: true,
      example: 'email addresses',
    },
    {
      name: 'type',
      description: 'Type of item to find',
      required: false,
      example: 'function definitions',
    },
    {
      name: 'filters',
      description: 'Filters to apply to results',
      required: false,
      example: '- Only from 2024\n- Containing "error"',
    },
    {
      name: 'maxResults',
      description: 'Maximum number of results',
      required: false,
      default: 'all',
      example: '10',
    },
  ],
  example: {
    variables: {
      query: 'TODO comments',
      type: 'code comments',
      maxResults: '20',
    },
    expectedOutput: 'List of TODO comments with file locations and context.',
  },
  tags: ['search', 'find', 'locate', 'query', 'grep'],
};

/**
 * Question answering template.
 */
export const qaTemplate: PromptTemplate = {
  id: 'qa',
  name: 'Question & Answer',
  description: 'Answer questions based on the provided context.',
  category: 'analysis',
  template: `Answer the following question based on the provided context:

Question: {{question}}

{{#if constraints}}
Constraints:
{{constraints}}
{{/if}}

{{#if style}}
Answer style: {{style}}
{{/if}}

Provide a clear, accurate answer based solely on the information in the context. If the answer cannot be determined from the context, say so.`,
  variables: [
    {
      name: 'question',
      description: 'The question to answer',
      required: true,
      example: 'What is the main conclusion of this study?',
    },
    {
      name: 'constraints',
      description: 'Constraints on the answer',
      required: false,
      example: '- Answer in one paragraph\n- Include citations',
    },
    {
      name: 'style',
      description: 'Style of the answer',
      required: false,
      default: 'informative',
      example: 'technical',
    },
  ],
  example: {
    variables: {
      question: 'What are the key findings?',
      style: 'concise',
    },
    expectedOutput: 'A direct answer to the question based on the context.',
  },
  tags: ['question', 'answer', 'qa', 'ask'],
};

/**
 * Code review template.
 */
export const codeReviewTemplate: PromptTemplate = {
  id: 'code-review',
  name: 'Code Review',
  description: 'Review code for quality, bugs, security issues, and best practices.',
  category: 'analysis',
  template: `Review the following code:

{{#if focus}}
Focus areas:
{{focus}}
{{/if}}

{{#if language}}
Language: {{language}}
{{/if}}

{{#if severity}}
Report issues with severity: {{severity}} and above.
{{/if}}

Analyze for:
1. Bugs and potential errors
2. Security vulnerabilities
3. Code quality and readability
4. Performance issues
5. Best practices violations

Provide specific, actionable feedback with line references where applicable.`,
  variables: [
    {
      name: 'focus',
      description: 'Specific areas to focus on',
      required: false,
      example: '- Security\n- Error handling',
    },
    {
      name: 'language',
      description: 'Programming language',
      required: false,
      example: 'TypeScript',
    },
    {
      name: 'severity',
      description: 'Minimum severity level to report',
      required: false,
      default: 'info',
      example: 'warning',
    },
  ],
  example: {
    variables: {
      language: 'Python',
      focus: '- SQL injection\n- Input validation',
      severity: 'warning',
    },
    expectedOutput: 'List of issues found with severity, location, and suggested fixes.',
  },
  tags: ['code', 'review', 'security', 'quality', 'bugs'],
};

/**
 * All built-in templates.
 */
export const BUILTIN_TEMPLATES: PromptTemplate[] = [
  summarizeTemplate,
  extractTemplate,
  analyzeTemplate,
  compareTemplate,
  searchTemplate,
  qaTemplate,
  codeReviewTemplate,
];

/**
 * Get a built-in template by ID.
 */
export function getBuiltinTemplate(id: string): PromptTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}
