import { describe, it, expect } from 'vitest';
import {
  // Tools
  parseJSONTool,
  parseCSVTool,
  formatTableTool,
  dedupeTool,
  sortTool,
  groupByTool,
  flattenTool,
  pickTool,
  omitTool,
  countByTool,
  summarizeTool,
  extractBetweenTool,
  truncateTool,
  textStatsTool,
  // Registry
  BUILTIN_TOOLS,
  createToolRegistry,
  defaultToolRegistry,
  getToolsHelp,
  validateTool,
  wrapToolFunction,
} from '../src/sandbox/tools.js';
import { VMSandbox } from '../src/sandbox/vm-sandbox.js';
import type { SandboxTool } from '../src/sandbox/tools.js';

describe('parseJSON Tool', () => {
  it('should parse valid JSON', () => {
    const result = parseJSONTool.fn('{"name": "John", "age": 30}');
    expect(result).toEqual({ name: 'John', age: 30 });
  });

  it('should return default on invalid JSON', () => {
    const result = parseJSONTool.fn('invalid json');
    expect(result).toBeNull();
  });

  it('should return custom default on invalid JSON', () => {
    const result = parseJSONTool.fn('invalid', { error: true });
    expect(result).toEqual({ error: true });
  });

  it('should handle non-string input', () => {
    const result = parseJSONTool.fn(123);
    expect(result).toBeNull();
  });
});

describe('parseCSV Tool', () => {
  it('should parse CSV with headers', () => {
    const csv = 'name,age\nJohn,30\nJane,25';
    const result = parseCSVTool.fn(csv);
    expect(result).toEqual([
      { name: 'John', age: '30' },
      { name: 'Jane', age: '25' },
    ]);
  });

  it('should parse CSV without headers', () => {
    const csv = 'John,30\nJane,25';
    const result = parseCSVTool.fn(csv, { headers: false });
    expect(result).toEqual([
      ['John', '30'],
      ['Jane', '25'],
    ]);
  });

  it('should handle custom delimiter', () => {
    const csv = 'name;age\nJohn;30';
    const result = parseCSVTool.fn(csv, { delimiter: ';' });
    expect(result).toEqual([{ name: 'John', age: '30' }]);
  });

  it('should handle quoted values', () => {
    const csv = 'name,description\nJohn,"Hello, World"';
    const result = parseCSVTool.fn(csv);
    expect(result).toEqual([{ name: 'John', description: 'Hello, World' }]);
  });

  it('should skip empty lines', () => {
    const csv = 'name,age\nJohn,30\n\nJane,25';
    const result = parseCSVTool.fn(csv);
    expect(result).toHaveLength(2);
  });
});

describe('formatTable Tool', () => {
  it('should format array of objects as table', () => {
    const data = [
      { name: 'John', age: 30 },
      { name: 'Jane', age: 25 },
    ];
    const result = formatTableTool.fn(data);
    expect(result).toContain('name');
    expect(result).toContain('age');
    expect(result).toContain('John');
    expect(result).toContain('Jane');
    expect(result).toContain('|');
    expect(result).toContain('-');
  });

  it('should use specified columns', () => {
    const data = [{ name: 'John', age: 30, city: 'NYC' }];
    const result = formatTableTool.fn(data, ['name', 'city']);
    expect(result).toContain('name');
    expect(result).toContain('city');
    expect(result).not.toContain('age');
  });

  it('should handle empty array', () => {
    const result = formatTableTool.fn([]);
    expect(result).toBe('');
  });
});

describe('dedupe Tool', () => {
  it('should remove duplicate primitives', () => {
    const result = dedupeTool.fn([1, 2, 2, 3, 3, 3]);
    expect(result).toEqual([1, 2, 3]);
  });

  it('should remove duplicate strings', () => {
    const result = dedupeTool.fn(['a', 'b', 'a', 'c']);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('should dedupe objects by key', () => {
    const data = [
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' },
      { id: 1, name: 'Johnny' },
    ];
    const result = dedupeTool.fn(data, 'id');
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('John');
  });

  it('should handle non-array input', () => {
    const result = dedupeTool.fn('not an array');
    expect(result).toEqual([]);
  });
});

describe('sort Tool', () => {
  it('should sort numbers ascending', () => {
    const result = sortTool.fn([3, 1, 4, 1, 5]);
    expect(result).toEqual([1, 1, 3, 4, 5]);
  });

  it('should sort numbers descending', () => {
    const result = sortTool.fn([3, 1, 4, 1, 5], undefined, true);
    expect(result).toEqual([5, 4, 3, 1, 1]);
  });

  it('should sort strings', () => {
    const result = sortTool.fn(['banana', 'apple', 'cherry']);
    expect(result).toEqual(['apple', 'banana', 'cherry']);
  });

  it('should sort objects by key', () => {
    const data = [
      { name: 'Charlie', age: 30 },
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 35 },
    ];
    const result = sortTool.fn(data, 'name') as Array<{ name: string }>;
    expect(result[0].name).toBe('Alice');
    expect(result[1].name).toBe('Bob');
    expect(result[2].name).toBe('Charlie');
  });

  it('should not mutate original array', () => {
    const original = [3, 1, 2];
    sortTool.fn(original);
    expect(original).toEqual([3, 1, 2]);
  });
});

describe('groupBy Tool', () => {
  it('should group by key', () => {
    const data = [
      { type: 'fruit', name: 'apple' },
      { type: 'vegetable', name: 'carrot' },
      { type: 'fruit', name: 'banana' },
    ];
    const result = groupByTool.fn(data, 'type') as Record<string, unknown[]>;
    expect(result.fruit).toHaveLength(2);
    expect(result.vegetable).toHaveLength(1);
  });

  it('should handle missing keys', () => {
    const data = [{ name: 'test' }];
    const result = groupByTool.fn(data, 'type') as Record<string, unknown[]>;
    expect(result.undefined).toHaveLength(1);
  });
});

describe('flatten Tool', () => {
  it('should flatten one level by default', () => {
    const result = flattenTool.fn([[1, 2], [3, [4, 5]]]);
    expect(result).toEqual([1, 2, 3, [4, 5]]);
  });

  it('should flatten to specified depth', () => {
    const result = flattenTool.fn([[1, [2, [3]]]], 2);
    expect(result).toEqual([1, 2, [3]]);
  });
});

describe('pick Tool', () => {
  it('should pick keys from object', () => {
    const result = pickTool.fn({ a: 1, b: 2, c: 3 }, ['a', 'c']);
    expect(result).toEqual({ a: 1, c: 3 });
  });

  it('should pick keys from array of objects', () => {
    const data = [
      { a: 1, b: 2 },
      { a: 3, b: 4 },
    ];
    const result = pickTool.fn(data, ['a']);
    expect(result).toEqual([{ a: 1 }, { a: 3 }]);
  });
});

describe('omit Tool', () => {
  it('should omit keys from object', () => {
    const result = omitTool.fn({ a: 1, b: 2, c: 3 }, ['b']);
    expect(result).toEqual({ a: 1, c: 3 });
  });

  it('should omit keys from array of objects', () => {
    const data = [
      { a: 1, b: 2 },
      { a: 3, b: 4 },
    ];
    const result = omitTool.fn(data, ['b']);
    expect(result).toEqual([{ a: 1 }, { a: 3 }]);
  });
});

describe('countBy Tool', () => {
  it('should count occurrences of primitives', () => {
    const result = countByTool.fn(['a', 'b', 'a', 'c', 'a']);
    expect(result).toEqual({ a: 3, b: 1, c: 1 });
  });

  it('should count by object key', () => {
    const data = [
      { type: 'a' },
      { type: 'b' },
      { type: 'a' },
    ];
    const result = countByTool.fn(data, 'type');
    expect(result).toEqual({ a: 2, b: 1 });
  });
});

describe('summarize Tool', () => {
  it('should summarize numeric array', () => {
    const result = summarizeTool.fn([1, 2, 3, 4, 5]);
    expect(result).toEqual({
      sum: 15,
      avg: 3,
      min: 1,
      max: 5,
      count: 5,
    });
  });

  it('should summarize by object key', () => {
    const data = [
      { value: 10 },
      { value: 20 },
      { value: 30 },
    ];
    const result = summarizeTool.fn(data, 'value');
    expect(result?.sum).toBe(60);
    expect(result?.avg).toBe(20);
  });

  it('should return null for empty array', () => {
    const result = summarizeTool.fn([]);
    expect(result).toBeNull();
  });
});

describe('extractBetween Tool', () => {
  it('should extract text between markers', () => {
    const text = '<tag>content1</tag> and <tag>content2</tag>';
    const result = extractBetweenTool.fn(text, '<tag>', '</tag>');
    expect(result).toEqual(['content1', 'content2']);
  });

  it('should include markers when specified', () => {
    const text = '<tag>content</tag>';
    const result = extractBetweenTool.fn(text, '<tag>', '</tag>', true);
    expect(result).toEqual(['<tag>content</tag>']);
  });

  it('should handle no matches', () => {
    const result = extractBetweenTool.fn('no markers here', '<start>', '<end>');
    expect(result).toEqual([]);
  });
});

describe('truncate Tool', () => {
  it('should truncate long text', () => {
    const result = truncateTool.fn('Hello World', 8);
    expect(result).toBe('Hello...');
  });

  it('should not truncate short text', () => {
    const result = truncateTool.fn('Hi', 10);
    expect(result).toBe('Hi');
  });

  it('should use custom suffix', () => {
    const result = truncateTool.fn('Hello World', 8, '…');
    expect(result).toBe('Hello W…');
  });
});

describe('textStats Tool', () => {
  it('should return text statistics', () => {
    const text = 'Hello World. This is a test.';
    const result = textStatsTool.fn(text);
    expect(result.chars).toBe(28);
    expect(result.words).toBe(6);
    expect(result.lines).toBe(1);
    expect(result.sentences).toBe(2);
  });

  it('should handle empty text', () => {
    const result = textStatsTool.fn('');
    expect(result.chars).toBe(0);
    expect(result.words).toBe(0);
  });
});

describe('Tool Registry', () => {
  describe('BUILTIN_TOOLS', () => {
    it('should contain all expected tools', () => {
      const names = BUILTIN_TOOLS.map((t) => t.name);
      expect(names).toContain('parseJSON');
      expect(names).toContain('parseCSV');
      expect(names).toContain('formatTable');
      expect(names).toContain('dedupe');
      expect(names).toContain('sort');
      expect(names).toContain('groupBy');
      expect(names).toContain('flatten');
      expect(names).toContain('pick');
      expect(names).toContain('omit');
      expect(names).toContain('countBy');
      expect(names).toContain('summarize');
      expect(names).toContain('extractBetween');
      expect(names).toContain('truncate');
      expect(names).toContain('textStats');
    });
  });

  describe('createToolRegistry', () => {
    it('should create registry with builtins', () => {
      const registry = createToolRegistry(true);
      expect(registry.has('parseJSON')).toBe(true);
      expect(registry.list().length).toBe(BUILTIN_TOOLS.length);
    });

    it('should create empty registry', () => {
      const registry = createToolRegistry(false);
      expect(registry.list().length).toBe(0);
    });

    it('should register custom tools', () => {
      const registry = createToolRegistry(false);
      const customTool: SandboxTool = {
        name: 'myTool',
        description: 'A custom tool',
        fn: () => 'result',
      };
      registry.register(customTool);
      expect(registry.has('myTool')).toBe(true);
    });

    it('should throw on duplicate registration', () => {
      const registry = createToolRegistry(false);
      const tool: SandboxTool = {
        name: 'test',
        description: 'Test',
        fn: () => {},
      };
      registry.register(tool);
      expect(() => registry.register(tool)).toThrow('already exists');
    });

    it('should unregister tools', () => {
      const registry = createToolRegistry(true);
      expect(registry.unregister('parseJSON')).toBe(true);
      expect(registry.has('parseJSON')).toBe(false);
    });

    it('should list by category', () => {
      const registry = createToolRegistry(true);
      const dataTools = registry.listByCategory('data');
      expect(dataTools.length).toBeGreaterThan(0);
      expect(dataTools.every((t) => t.category === 'data')).toBe(true);
    });

    it('should convert to sandbox map', () => {
      const registry = createToolRegistry(true);
      const map = registry.toSandboxMap();
      expect(typeof map.parseJSON).toBe('function');
      expect(typeof map.sort).toBe('function');
    });
  });

  describe('defaultToolRegistry', () => {
    it('should have all builtins', () => {
      expect(defaultToolRegistry.has('parseJSON')).toBe(true);
      expect(defaultToolRegistry.list().length).toBe(BUILTIN_TOOLS.length);
    });
  });

  describe('getToolsHelp', () => {
    it('should return help text', () => {
      const help = getToolsHelp();
      expect(help).toContain('Available sandbox tools');
      expect(help).toContain('parseJSON');
      expect(help).toContain('DATA');
    });
  });
});

describe('Tool Validation', () => {
  it('should validate correct tool', () => {
    const tool: SandboxTool = {
      name: 'validTool',
      description: 'A valid tool',
      fn: () => {},
    };
    expect(validateTool(tool)).toBe(true);
  });

  it('should reject tool without name', () => {
    expect(validateTool({ description: 'test', fn: () => {} })).toBe(false);
  });

  it('should reject tool without description', () => {
    expect(validateTool({ name: 'test', fn: () => {} })).toBe(false);
  });

  it('should reject tool without function', () => {
    expect(validateTool({ name: 'test', description: 'test' })).toBe(false);
  });

  it('should reject invalid name format', () => {
    expect(validateTool({ name: '123invalid', description: 'test', fn: () => {} })).toBe(false);
    expect(validateTool({ name: 'has-dash', description: 'test', fn: () => {} })).toBe(false);
  });

  it('should accept valid name formats', () => {
    expect(validateTool({ name: 'valid_name', description: 'test', fn: () => {} })).toBe(true);
    expect(validateTool({ name: '_private', description: 'test', fn: () => {} })).toBe(true);
    expect(validateTool({ name: 'CamelCase', description: 'test', fn: () => {} })).toBe(true);
  });
});

describe('wrapToolFunction', () => {
  it('should wrap function with error handling', () => {
    const tool: SandboxTool = {
      name: 'errorTool',
      description: 'Throws error',
      fn: () => {
        throw new Error('Test error');
      },
    };
    const wrapped = wrapToolFunction(tool);
    // Should not throw, returns undefined
    expect(wrapped()).toBeUndefined();
  });

  it('should pass through normal return values', () => {
    const tool: SandboxTool = {
      name: 'goodTool',
      description: 'Returns value',
      fn: (x: unknown) => `result: ${x}`,
    };
    const wrapped = wrapToolFunction(tool);
    expect(wrapped('test')).toBe('result: test');
  });
});

describe('VMSandbox with Tools', () => {
  it('should have builtin tools available', async () => {
    const sandbox = new VMSandbox({
      context: 'test context',
      onLLMQuery: async () => 'mock',
    });

    const result = await sandbox.execute(`
      const data = parseJSON('{"a": 1, "b": 2}');
      print(data.a, data.b);
    `);

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('1 2');
  });

  it('should support parseCSV in sandbox', async () => {
    const sandbox = new VMSandbox({
      context: 'name,age\nJohn,30',
      onLLMQuery: async () => 'mock',
    });

    const result = await sandbox.execute(`
      const data = parseCSV(context);
      print(data[0].name, data[0].age);
    `);

    expect(result.error).toBeUndefined();
    expect(result.output).toContain('John');
    expect(result.output).toContain('30');
  });

  it('should support custom tools', async () => {
    const customTool: SandboxTool = {
      name: 'double',
      description: 'Doubles a number',
      fn: (n: unknown) => (typeof n === 'number' ? n * 2 : 0),
    };

    const sandbox = new VMSandbox({
      context: '',
      onLLMQuery: async () => 'mock',
      tools: [customTool],
    });

    const result = await sandbox.execute(`
      print(double(21));
    `);

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('42');
  });

  it('should disable builtin tools when configured', async () => {
    const sandbox = new VMSandbox({
      context: '',
      onLLMQuery: async () => 'mock',
      includeBuiltinTools: false,
    });

    const result = await sandbox.execute(`
      print(typeof parseJSON);
    `);

    expect(result.output).toBe('undefined');
  });

  it('should support tool registry', async () => {
    const registry = createToolRegistry(false);
    registry.register({
      name: 'customAdd',
      description: 'Adds two numbers',
      fn: (a: unknown, b: unknown) => (Number(a) || 0) + (Number(b) || 0),
    });

    const sandbox = new VMSandbox({
      context: '',
      onLLMQuery: async () => 'mock',
      toolRegistry: registry,
    });

    const result = await sandbox.execute(`
      print(customAdd(10, 20));
    `);

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('30');
  });
});
