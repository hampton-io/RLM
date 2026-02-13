import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VMSandbox } from '../src/sandbox/vm-sandbox.js';
import type { SandboxEnvironment } from '../src/types.js';

describe('VMSandbox', () => {
  let sandbox: SandboxEnvironment;

  beforeEach(() => {
    sandbox = new VMSandbox({
      context: 'Hello, this is the test context with some data.',
      onLLMQuery: async (prompt) => {
        return `Mock response for: ${prompt}`;
      },
    });
  });

  afterEach(() => {
    sandbox.dispose();
  });

  it('should access context variable', async () => {
    const result = await sandbox.execute('print(context.slice(0, 5))');

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('Hello');
  });

  it('should execute print statements', async () => {
    const result = await sandbox.execute(`
      print("Line 1");
      print("Line 2");
      print("Value:", 42);
    `);

    expect(result.error).toBeUndefined();
    expect(result.output).toContain('Line 1');
    expect(result.output).toContain('Line 2');
    expect(result.output).toContain('Value: 42');
  });

  it('should use chunk utility', async () => {
    const result = await sandbox.execute(`
      const chunks = chunk("abcdefghij", 3);
      print(JSON.stringify(chunks));
    `);

    expect(result.error).toBeUndefined();
    expect(result.output).toContain('["abc","def","ghi","j"]');
  });

  it('should use grep utility', async () => {
    const result = await sandbox.execute(`
      const text = "line 1\\nfoo bar\\nline 3\\nfoo baz";
      const matches = grep(text, /foo/);
      print(JSON.stringify(matches));
    `);

    expect(result.error).toBeUndefined();
    expect(result.output).toContain('foo bar');
    expect(result.output).toContain('foo baz');
  });

  it('should handle sticky regex flags safely', async () => {
    const result = await sandbox.execute(`
      const text = "foo\\nfoo\\nbar";
      const matches = grep(text, /foo/y);
      print(JSON.stringify(matches));
    `);

    expect(result.error).toBeUndefined();
    expect(result.output).toContain('["foo","foo"]');
  });

  it('should handle global regex flags safely', async () => {
    const result = await sandbox.execute(`
      const text = "foo\\nfoo\\nbar";
      const matches = grep(text, /foo/g);
      print(JSON.stringify(matches));
    `);

    expect(result.error).toBeUndefined();
    expect(result.output).toContain('["foo","foo"]');
  });

  it('should use len utility', async () => {
    const result = await sandbox.execute(`
      print(len(context));
    `);

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('47'); // Length of test context
  });

  it('should block code generation escapes', async () => {
    const result = await sandbox.execute(`
      const getProcess = this.constructor.constructor('return process');
      print(getProcess());
    `);

    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/code generation|constructor|undefined/i);
  });

  it('should handle errors gracefully', async () => {
    const result = await sandbox.execute(`
      throw new Error("Test error");
    `);

    expect(result.error).toBeDefined();
    expect(result.error).toContain('Test error');
  });

  it('should track execution time', async () => {
    const result = await sandbox.execute(`
      let sum = 0;
      for (let i = 0; i < 1000; i++) sum += i;
      print(sum);
    `);

    // Execution time should be a non-negative number
    expect(result.executionTime).toBeGreaterThanOrEqual(0);
    expect(typeof result.executionTime).toBe('number');
  });

  it('should set and get variables', () => {
    sandbox.setVariable('myVar', 'test value');
    const value = sandbox.getVariable('myVar');

    expect(value).toBe('test value');
  });

  it('should reset state', async () => {
    await sandbox.execute('print("test")');
    sandbox.reset();

    const result = await sandbox.execute('print("after reset")');
    expect(result.output).toBe('after reset');
  });

  it('should support console.log', async () => {
    const result = await sandbox.execute(`
      console.log("Console log test");
      console.error("Console error test");
    `);

    expect(result.output).toContain('Console log test');
    expect(result.output).toContain('[ERROR] Console error test');
  });

  it('should have access to built-in JavaScript objects', async () => {
    const result = await sandbox.execute(`
      const arr = [3, 1, 2];
      arr.sort();
      const obj = { a: 1, b: 2 };
      const keys = Object.keys(obj);
      const json = JSON.stringify({ arr, keys });
      print(json);
    `);

    expect(result.error).toBeUndefined();
    expect(result.output).toContain('[1,2,3]');
    expect(result.output).toContain('["a","b"]');
  });
});
