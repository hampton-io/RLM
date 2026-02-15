import { describe, it, expect, beforeAll } from 'vitest';
import { RLMExecutor } from '../src/executor.js';

/**
 * Tests for [object Object] bug prevention
 *
 * When models concatenate objects with strings, JavaScript produces [object Object].
 * These tests verify that RLM handles this correctly.
 *
 * Requires OPENAI_API_KEY — skipped in CI without keys.
 */

const HAS_OPENAI_KEY = !!process.env.OPENAI_API_KEY;

describe.skipIf(!HAS_OPENAI_KEY)('[object Object] Bug Prevention', () => {
  let executor: RLMExecutor;

  beforeAll(() => {
    executor = new RLMExecutor({
      model: 'gpt-5.2',
      maxIterations: 10,
    });
  });

  it('should handle object concatenation without producing [object Object]', async () => {
    const result = await executor.execute(
      `Create an object: const data = {name: "Alice", age: 30};
Then create a string: const output = "User: " + data;
Then call FINAL(output).`,
      ''
    );

    // Should NOT contain [object Object]
    expect(result.response).not.toContain('[object Object]');
    
    // Should contain the actual object data
    expect(result.response).toMatch(/Alice/);
    expect(result.response).toMatch(/30/);
  });

  it('should handle template literal object interpolation', async () => {
    const result = await executor.execute(
      `Create an object: const user = {id: 123, name: "Bob"};
Then create: const output = \`User \${user.id}: \${user.name}\`;
Then FINAL(output).`,
      ''
    );

    expect(result.response).not.toContain('[object Object]');
    expect(result.response).toMatch(/123/);
    expect(result.response).toMatch(/Bob/);
  });

  it('should handle str() helper function', async () => {
    const result = await executor.execute(
      `Create an object: const data = {x: 10, y: 20};
Then create: const output = "Data: " + str(data);
Then FINAL(output).`,
      ''
    );

    expect(result.response).not.toContain('[object Object]');
    expect(result.response).toContain('{"x":10,"y":20}');
  });

  it('should handle JSON.stringify() function', async () => {
    const result = await executor.execute(
      `Create an object: const data = {status: "ok", count: 5};
Then create: const output = "Status: " + JSON.stringify(data);
Then FINAL(output).`,
      ''
    );

    expect(result.response).not.toContain('[object Object]');
    expect(result.response).toContain('{"status":"ok","count":5}');
  });

  it('should NOT produce [object Object] with the toString patch', async () => {
    // With the Object.prototype.toString patch, this should work correctly
    const result = await executor.execute(
      `Create an object: const data = {test: true};
Then create: const output = "Data: " + data;
Then FINAL(output).`,
      ''
    );

    // Should NOT contain [object Object] due to our patch
    expect(result.response).not.toContain('[object Object]');
    // Should contain the actual data
    expect(result.response).toContain('test');
    expect(result.response).toContain('true');
  });

  it('should handle complex nested objects', async () => {
    const result = await executor.execute(
      `Create: const config = {api: {host: "api.example.com", port: 443}, auth: {token: "abc123"}};
Then create: const output = "Config: " + str(config);
Then FINAL(output).`,
      ''
    );

    expect(result.response).not.toContain('[object Object]');
    expect(result.response).toContain('api.example.com');
    expect(result.response).toContain('443');
    expect(result.response).toContain('abc123');
  });

  it('should handle arrays in concatenation', async () => {
    const result = await executor.execute(
      `Create: const items = ["apple", "banana", "cherry"];
Then create: const output = "Items: " + str(items);
Then FINAL(output).`,
      ''
    );

    expect(result.response).not.toContain('[object Object]');
    expect(result.response).toContain('apple');
    expect(result.response).toContain('banana');
    expect(result.response).toContain('cherry');
  });

  it('should handle Date objects', async () => {
    const result = await executor.execute(
      `Create: const date = new Date("2024-01-01T00:00:00Z");
Then create: const output = "Date: " + str(date);
Then FINAL(output).`,
      ''
    );

    expect(result.response).not.toContain('[object Object]');
    expect(result.response).toMatch(/2024/);
  });

  it('should handle Map and Set objects', async () => {
    const result = await executor.execute(
      `Create: const map = new Map([["key1", "value1"], ["key2", "value2"]]);
Then create: const output = "Map: " + str(map);
Then FINAL(output).`,
      ''
    );

    expect(result.response).not.toContain('[object Object]');
    expect(result.response).toContain('key1');
    expect(result.response).toContain('value1');
  });

  it('should handle undefined/null in objects', async () => {
    const result = await executor.execute(
      `Create: const data = {name: "Test", age: null, email: undefined};
Then create: const output = "Data: " + str(data);
Then FINAL(output).`,
      ''
    );

    expect(result.response).not.toContain('[object Object]');
    expect(result.response).toContain('name');
    expect(result.response).toContain('null');
    // undefined values should be omitted in JSON.stringify
  });

  it('should handle circular references gracefully', async () => {
    const result = await executor.execute(
      `Create: const obj = {name: "test"};
// Try to create circular reference
obj.self = obj;
Then create: const output = "Circular: " + str(obj);
Then FINAL(output).`,
      ''
    );

    // Circular references will fall back to [object Object] because JSON.stringify throws
    // This is acceptable behavior - the alternative would be to crash
    expect(result.response).toBeDefined();
    
    // Either the model avoided the circular ref, or we got fallback behavior
    // Both are acceptable
    const hasValidResponse = result.response.length > 0;
    expect(hasValidResponse).toBe(true);
  });

  it('should know how to stringify objects', async () => {
    const result = await executor.execute(
      `Look at the available functions and tell me how to convert an object to a string properly.
      Then give me a 1-line example of using it.
      FINAL("Answer: " + your_example)`,
      ''
    );

    // Model should know about str() or JSON.stringify - either is valid
    const knowsStringify = result.response.includes('str(') || 
                           result.response.includes('JSON.stringify') ||
                           result.response.includes('json(');
    expect(knowsStringify).toBe(true);
  });
});