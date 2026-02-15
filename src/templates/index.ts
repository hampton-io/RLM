/**
 * Prompt Templates Module
 *
 * Provides pre-built templates and utilities for common RLM use cases.
 */

export type {
  PromptTemplate,
  TemplateCategory,
  TemplateVariable,
  TemplateExample,
  RenderOptions,
  RenderResult,
  TemplateRegistry,
} from './types.js';

export {
  BUILTIN_TEMPLATES,
  getBuiltinTemplate,
  summarizeTemplate,
  extractTemplate,
  analyzeTemplate,
  compareTemplate,
  searchTemplate,
  qaTemplate,
  codeReviewTemplate,
} from './builtin.js';

import type {
  PromptTemplate,
  TemplateCategory,
  TemplateRegistry,
  RenderOptions,
  RenderResult,
} from './types.js';
import { BUILTIN_TEMPLATES } from './builtin.js';

// =============================================================================
// Template Rendering
// =============================================================================

/**
 * Render a template with variable substitution.
 *
 * Supports simple {{variable}} syntax and basic conditionals:
 * - {{variable}} - substitutes the variable value
 * - {{#if variable}}...{{/if}} - includes content if variable is truthy
 *
 * @param template - The template to render
 * @param options - Render options including variables
 * @returns The rendered result
 */
export function renderTemplate(
  template: PromptTemplate,
  options: RenderOptions = {}
): RenderResult {
  const { variables = {}, strict = true } = options;
  const substituted: string[] = [];
  const missing: string[] = [];

  let result = template.template;

  // Process conditionals first: {{#if variable}}...{{/if}}
  const conditionalRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(conditionalRegex, (_, varName, content) => {
    const value = variables[varName] ?? getDefaultValue(template, varName);
    if (value && value.trim() !== '') {
      return content;
    }
    return '';
  });

  // Process variable substitutions: {{variable}}
  const variableRegex = /\{\{(\w+)\}\}/g;
  result = result.replace(variableRegex, (_, varName) => {
    // Check if it's a defined variable
    const varDef = template.variables.find((v) => v.name === varName);

    // Get value from provided variables or default
    const value = variables[varName] ?? getDefaultValue(template, varName);

    if (value !== undefined && value !== '') {
      substituted.push(varName);
      return value;
    }

    // Variable not provided
    if (varDef?.required) {
      missing.push(varName);
      if (strict) {
        throw new Error(
          `Required variable "${varName}" not provided for template "${template.id}"`
        );
      }
    }

    // Return placeholder for missing optional variables
    return `[${varName}]`;
  });

  // Clean up extra whitespace from removed conditionals
  result = result.replace(/\n{3,}/g, '\n\n').trim();

  return {
    prompt: result,
    substituted,
    missing,
  };
}

/**
 * Get the default value for a template variable.
 */
function getDefaultValue(template: PromptTemplate, varName: string): string | undefined {
  const varDef = template.variables.find((v) => v.name === varName);
  return varDef?.default;
}

/**
 * Render a template by ID.
 */
export function render(
  templateId: string,
  variables?: Record<string, string>,
  registry?: TemplateRegistry
): string {
  const reg = registry ?? defaultRegistry;
  const template = reg.get(templateId);

  if (!template) {
    throw new Error(`Template "${templateId}" not found`);
  }

  const result = renderTemplate(template, { variables });
  return result.prompt;
}

// =============================================================================
// Template Registry Implementation
// =============================================================================

/**
 * Create a new template registry.
 */
export function createTemplateRegistry(includeBuiltins: boolean = true): TemplateRegistry {
  const templates = new Map<string, PromptTemplate>();

  // Initialize with built-in templates
  if (includeBuiltins) {
    for (const template of BUILTIN_TEMPLATES) {
      templates.set(template.id, template);
    }
  }

  return {
    get(id: string): PromptTemplate | undefined {
      return templates.get(id);
    },

    list(): PromptTemplate[] {
      return Array.from(templates.values());
    },

    listByCategory(category: TemplateCategory): PromptTemplate[] {
      return Array.from(templates.values()).filter((t) => t.category === category);
    },

    search(query: string): PromptTemplate[] {
      const q = query.toLowerCase();
      return Array.from(templates.values()).filter((t) => {
        return (
          t.id.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags?.some((tag) => tag.toLowerCase().includes(q))
        );
      });
    },

    register(template: PromptTemplate): void {
      if (templates.has(template.id)) {
        throw new Error(`Template with ID "${template.id}" already exists`);
      }
      templates.set(template.id, template);
    },

    unregister(id: string): boolean {
      return templates.delete(id);
    },

    has(id: string): boolean {
      return templates.has(id);
    },
  };
}

/**
 * Default global template registry.
 */
export const defaultRegistry = createTemplateRegistry();

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * List all available template IDs.
 */
export function listTemplateIds(): string[] {
  return defaultRegistry.list().map((t) => t.id);
}

/**
 * Get template info for CLI help.
 */
export function getTemplateHelp(): string {
  const templates = defaultRegistry.list();
  const lines = ['Available templates:', ''];

  for (const t of templates) {
    lines.push(`  ${t.id.padEnd(15)} ${t.description}`);
  }

  lines.push('');
  lines.push('Use --template <id> to use a template.');
  lines.push('Use --template <id> --template-vars "key=value,key2=value2" to set variables.');

  return lines.join('\n');
}

/**
 * Parse template variables from CLI string.
 * Format: "key=value,key2=value2"
 */
export function parseTemplateVars(varsString: string): Record<string, string> {
  const vars: Record<string, string> = {};

  if (!varsString) return vars;

  const pairs = varsString.split(',');
  for (const pair of pairs) {
    const eqIndex = pair.indexOf('=');
    if (eqIndex > 0) {
      const key = pair.slice(0, eqIndex).trim();
      const value = pair.slice(eqIndex + 1).trim();
      vars[key] = value;
    }
  }

  return vars;
}

/**
 * Create a quick template from a simple string.
 * Useful for one-off templates.
 */
export function quickTemplate(prompt: string, variables?: Record<string, string>): string {
  // Simple variable substitution
  let result = prompt;

  if (variables) {
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
  }

  return result;
}
