import { describe, it, expect } from 'vitest';
import {
  BUILTIN_TEMPLATES,
  getBuiltinTemplate,
  summarizeTemplate,
  extractTemplate,
  analyzeTemplate,
  compareTemplate,
  searchTemplate,
  qaTemplate,
  codeReviewTemplate,
  renderTemplate,
  render,
  createTemplateRegistry,
  defaultRegistry,
  listTemplateIds,
  getTemplateHelp,
  parseTemplateVars,
  quickTemplate,
} from '../src/templates/index.js';
import type { PromptTemplate } from '../src/templates/types.js';

describe('Built-in Templates', () => {
  it('should have all expected templates', () => {
    expect(BUILTIN_TEMPLATES.length).toBe(7);

    const ids = BUILTIN_TEMPLATES.map((t) => t.id);
    expect(ids).toContain('summarize');
    expect(ids).toContain('extract');
    expect(ids).toContain('analyze');
    expect(ids).toContain('compare');
    expect(ids).toContain('search');
    expect(ids).toContain('qa');
    expect(ids).toContain('code-review');
  });

  it('should have valid structure for all templates', () => {
    for (const template of BUILTIN_TEMPLATES) {
      expect(template.id).toBeTruthy();
      expect(template.name).toBeTruthy();
      expect(template.description).toBeTruthy();
      expect(template.category).toBeTruthy();
      expect(template.template).toBeTruthy();
      expect(Array.isArray(template.variables)).toBe(true);
    }
  });

  it('should get template by ID', () => {
    expect(getBuiltinTemplate('summarize')).toBe(summarizeTemplate);
    expect(getBuiltinTemplate('extract')).toBe(extractTemplate);
    expect(getBuiltinTemplate('nonexistent')).toBeUndefined();
  });

  it('should have tags for discovery', () => {
    expect(summarizeTemplate.tags).toContain('summary');
    expect(searchTemplate.tags).toContain('find');
    expect(codeReviewTemplate.tags).toContain('security');
  });
});

describe('Template Rendering', () => {
  describe('renderTemplate', () => {
    it('should substitute simple variables', () => {
      const template: PromptTemplate = {
        id: 'test',
        name: 'Test',
        description: 'Test template',
        category: 'custom',
        template: 'Hello {{name}}!',
        variables: [
          { name: 'name', description: 'Name', required: true },
        ],
      };

      const result = renderTemplate(template, {
        variables: { name: 'World' },
      });

      expect(result.prompt).toBe('Hello World!');
      expect(result.substituted).toContain('name');
      expect(result.missing).toHaveLength(0);
    });

    it('should use default values', () => {
      const template: PromptTemplate = {
        id: 'test',
        name: 'Test',
        description: 'Test template',
        category: 'custom',
        template: 'Type: {{type}}',
        variables: [
          { name: 'type', description: 'Type', required: false, default: 'document' },
        ],
      };

      const result = renderTemplate(template);

      expect(result.prompt).toBe('Type: document');
    });

    it('should handle conditional blocks', () => {
      const template: PromptTemplate = {
        id: 'test',
        name: 'Test',
        description: 'Test template',
        category: 'custom',
        template: 'Start {{#if extra}}Extra: {{extra}}{{/if}} End',
        variables: [
          { name: 'extra', description: 'Extra', required: false },
        ],
      };

      // Without variable
      const result1 = renderTemplate(template);
      expect(result1.prompt).toBe('Start  End');

      // With variable
      const result2 = renderTemplate(template, {
        variables: { extra: 'content' },
      });
      expect(result2.prompt).toBe('Start Extra: content End');
    });

    it('should throw on missing required variables in strict mode', () => {
      const template: PromptTemplate = {
        id: 'test',
        name: 'Test',
        description: 'Test template',
        category: 'custom',
        template: 'Hello {{name}}!',
        variables: [
          { name: 'name', description: 'Name', required: true },
        ],
      };

      expect(() => renderTemplate(template, { strict: true })).toThrow(
        'Required variable "name" not provided'
      );
    });

    it('should not throw in non-strict mode', () => {
      const template: PromptTemplate = {
        id: 'test',
        name: 'Test',
        description: 'Test template',
        category: 'custom',
        template: 'Hello {{name}}!',
        variables: [
          { name: 'name', description: 'Name', required: true },
        ],
      };

      const result = renderTemplate(template, { strict: false });
      expect(result.prompt).toBe('Hello [name]!');
      expect(result.missing).toContain('name');
    });
  });

  describe('render', () => {
    it('should render template by ID', () => {
      const result = render('qa', { question: 'What is the answer?' });
      expect(result).toContain('What is the answer?');
    });

    it('should throw for unknown template', () => {
      expect(() => render('nonexistent')).toThrow('Template "nonexistent" not found');
    });
  });

  describe('quickTemplate', () => {
    it('should substitute variables in simple string', () => {
      const result = quickTemplate('Hello {{name}}!', { name: 'World' });
      expect(result).toBe('Hello World!');
    });

    it('should handle multiple variables', () => {
      const result = quickTemplate('{{greeting}} {{name}}!', {
        greeting: 'Hi',
        name: 'User',
      });
      expect(result).toBe('Hi User!');
    });

    it('should work without variables', () => {
      const result = quickTemplate('Plain text');
      expect(result).toBe('Plain text');
    });
  });
});

describe('Template Registry', () => {
  describe('defaultRegistry', () => {
    it('should contain all built-in templates', () => {
      for (const template of BUILTIN_TEMPLATES) {
        expect(defaultRegistry.has(template.id)).toBe(true);
      }
    });

    it('should list all templates', () => {
      const templates = defaultRegistry.list();
      expect(templates.length).toBe(BUILTIN_TEMPLATES.length);
    });
  });

  describe('createTemplateRegistry', () => {
    it('should create registry with built-ins', () => {
      const registry = createTemplateRegistry(true);
      expect(registry.list().length).toBe(BUILTIN_TEMPLATES.length);
    });

    it('should create empty registry', () => {
      const registry = createTemplateRegistry(false);
      expect(registry.list().length).toBe(0);
    });

    it('should register custom templates', () => {
      const registry = createTemplateRegistry(false);
      const customTemplate: PromptTemplate = {
        id: 'custom',
        name: 'Custom',
        description: 'Custom template',
        category: 'custom',
        template: 'Custom {{value}}',
        variables: [{ name: 'value', description: 'Value', required: true }],
      };

      registry.register(customTemplate);
      expect(registry.has('custom')).toBe(true);
      expect(registry.get('custom')).toBe(customTemplate);
    });

    it('should throw on duplicate registration', () => {
      const registry = createTemplateRegistry(false);
      const template: PromptTemplate = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        category: 'custom',
        template: 'Test',
        variables: [],
      };

      registry.register(template);
      expect(() => registry.register(template)).toThrow('already exists');
    });

    it('should unregister templates', () => {
      const registry = createTemplateRegistry(false);
      const template: PromptTemplate = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        category: 'custom',
        template: 'Test',
        variables: [],
      };

      registry.register(template);
      expect(registry.unregister('test')).toBe(true);
      expect(registry.has('test')).toBe(false);
      expect(registry.unregister('test')).toBe(false);
    });

    it('should list templates by category', () => {
      const analysis = defaultRegistry.listByCategory('analysis');
      expect(analysis.length).toBeGreaterThan(0);
      expect(analysis.every((t) => t.category === 'analysis')).toBe(true);
    });

    it('should search templates', () => {
      const results = defaultRegistry.search('code');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((t) => t.id === 'code-review')).toBe(true);

      const tagResults = defaultRegistry.search('security');
      expect(tagResults.some((t) => t.tags?.includes('security'))).toBe(true);
    });
  });
});

describe('Utility Functions', () => {
  describe('listTemplateIds', () => {
    it('should return all template IDs', () => {
      const ids = listTemplateIds();
      expect(ids).toContain('summarize');
      expect(ids).toContain('extract');
      expect(ids.length).toBe(BUILTIN_TEMPLATES.length);
    });
  });

  describe('getTemplateHelp', () => {
    it('should return help text', () => {
      const help = getTemplateHelp();
      expect(help).toContain('Available templates');
      expect(help).toContain('summarize');
      expect(help).toContain('--template');
    });
  });

  describe('parseTemplateVars', () => {
    it('should parse key=value pairs', () => {
      const vars = parseTemplateVars('name=John,age=30');
      expect(vars).toEqual({ name: 'John', age: '30' });
    });

    it('should handle empty string', () => {
      const vars = parseTemplateVars('');
      expect(vars).toEqual({});
    });

    it('should handle values with equals signs', () => {
      const vars = parseTemplateVars('equation=a=b+c');
      expect(vars).toEqual({ equation: 'a=b+c' });
    });

    it('should trim whitespace', () => {
      const vars = parseTemplateVars(' name = John , age = 30 ');
      expect(vars).toEqual({ name: 'John', age: '30' });
    });
  });
});
