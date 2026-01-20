/**
 * Prompt Template Types
 *
 * Templates provide pre-built patterns for common RLM use cases.
 */

/**
 * A prompt template definition.
 */
export interface PromptTemplate {
  /** Unique identifier for the template */
  id: string;
  /** Display name */
  name: string;
  /** Description of what this template does */
  description: string;
  /** Category for organization */
  category: TemplateCategory;
  /** The template string with {{variable}} placeholders */
  template: string;
  /** Variables that can be substituted in the template */
  variables: TemplateVariable[];
  /** Example usage */
  example?: TemplateExample;
  /** Tags for discovery */
  tags?: string[];
}

/**
 * Template categories.
 */
export type TemplateCategory =
  | 'analysis'
  | 'extraction'
  | 'summarization'
  | 'comparison'
  | 'search'
  | 'generation'
  | 'transformation'
  | 'custom';

/**
 * A variable that can be substituted in a template.
 */
export interface TemplateVariable {
  /** Variable name (used as {{name}} in template) */
  name: string;
  /** Description of the variable */
  description: string;
  /** Whether this variable is required */
  required: boolean;
  /** Default value if not provided */
  default?: string;
  /** Example value */
  example?: string;
}

/**
 * Example usage of a template.
 */
export interface TemplateExample {
  /** Example input variables */
  variables: Record<string, string>;
  /** Expected output description */
  expectedOutput: string;
}

/**
 * Options for rendering a template.
 */
export interface RenderOptions {
  /** Variable values to substitute */
  variables?: Record<string, string>;
  /** Whether to throw on missing required variables (default: true) */
  strict?: boolean;
}

/**
 * Result of rendering a template.
 */
export interface RenderResult {
  /** The rendered prompt */
  prompt: string;
  /** Variables that were substituted */
  substituted: string[];
  /** Variables that were missing */
  missing: string[];
}

/**
 * A registry of templates.
 */
export interface TemplateRegistry {
  /** Get a template by ID */
  get(id: string): PromptTemplate | undefined;
  /** List all templates */
  list(): PromptTemplate[];
  /** List templates by category */
  listByCategory(category: TemplateCategory): PromptTemplate[];
  /** Search templates by tag or name */
  search(query: string): PromptTemplate[];
  /** Register a custom template */
  register(template: PromptTemplate): void;
  /** Unregister a template */
  unregister(id: string): boolean;
  /** Check if a template exists */
  has(id: string): boolean;
}
