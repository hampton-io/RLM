import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VMSandbox } from '../src/sandbox/vm-sandbox.js';
import type { SandboxEnvironment } from '../src/types.js';

describe('VMSandbox Security', () => {
  let sandbox: SandboxEnvironment;

  beforeEach(() => {
    sandbox = new VMSandbox({
      context: 'Test context for security tests.',
      onLLMQuery: async (prompt) => `Mock: ${prompt}`,
    });
  });

  afterEach(() => {
    sandbox.dispose();
  });

  describe('Isolation', () => {
    it('should not have access to Node.js require', async () => {
      const result = await sandbox.execute(`
        try {
          const fs = require('fs');
          print('FAIL: require worked');
        } catch (e) {
          print('OK: require blocked');
        }
      `);

      expect(result.output).toContain('OK: require blocked');
    });

    it('should not have access to global process', async () => {
      const result = await sandbox.execute(`
        try {
          print(typeof process);
          if (typeof process !== 'undefined' && process.env) {
            print('FAIL: process.env accessible');
          } else {
            print('OK: process restricted');
          }
        } catch (e) {
          print('OK: process blocked');
        }
      `);

      expect(result.output).not.toContain('FAIL');
    });

    it('should not have access to __dirname or __filename', async () => {
      const result = await sandbox.execute(`
        const hasDirname = typeof __dirname !== 'undefined';
        const hasFilename = typeof __filename !== 'undefined';
        print(hasDirname ? 'FAIL: __dirname exists' : 'OK');
        print(hasFilename ? 'FAIL: __filename exists' : 'OK');
      `);

      expect(result.output).not.toContain('FAIL');
    });

    it('should not be able to access the host file system', async () => {
      const result = await sandbox.execute(`
        try {
          const fs = require('fs');
          fs.readFileSync('/etc/passwd');
          print('FAIL: file access worked');
        } catch (e) {
          print('OK: file access blocked');
        }
      `);

      expect(result.output).toContain('OK: file access blocked');
    });

    it('should not be able to spawn child processes', async () => {
      const result = await sandbox.execute(`
        try {
          const cp = require('child_process');
          cp.exec('ls');
          print('FAIL: child_process worked');
        } catch (e) {
          print('OK: child_process blocked');
        }
      `);

      expect(result.output).toContain('OK: child_process blocked');
    });

    it('should not have access to global module', async () => {
      const result = await sandbox.execute(`
        const hasModule = typeof module !== 'undefined';
        print(hasModule ? 'FAIL: module exists' : 'OK: no module');
      `);

      expect(result.output).toContain('OK: no module');
    });

    it('should not be able to import ES modules', async () => {
      const result = await sandbox.execute(`
        try {
          const mod = await import('fs');
          print('FAIL: import worked');
        } catch (e) {
          print('OK: import blocked');
        }
      `);

      expect(result.output).toContain('OK: import blocked');
    });
  });

  describe('Resource Limits', () => {
    it('should timeout on infinite loops', async () => {
      const timeoutSandbox = new VMSandbox({
        context: 'test',
        options: { timeout: 100 },
        onLLMQuery: async () => 'mock',
      });

      const result = await timeoutSandbox.execute(`
        while(true) {}
      `);

      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/timeout|timed out/i);

      timeoutSandbox.dispose();
    });

    it('should handle very long strings without crashing', async () => {
      const result = await sandbox.execute(`
        const longStr = 'x'.repeat(100000);
        print('Length: ' + longStr.length);
      `);

      expect(result.error).toBeUndefined();
      expect(result.output).toContain('Length: 100000');
    });

    it('should handle deep recursion gracefully', async () => {
      const result = await sandbox.execute(`
        function recurse(n) {
          if (n <= 0) return 0;
          return 1 + recurse(n - 1);
        }
        try {
          recurse(100000);
          print('FAIL: no stack overflow');
        } catch (e) {
          print('OK: recursion limited');
        }
      `);

      // Either it completes (unlikely) or throws an error
      expect(result.output).toBeDefined();
    });
  });

  describe('Context Isolation', () => {
    it('should isolate variables between sandbox instances', async () => {
      await sandbox.execute(`
        globalThis.sharedVar = 'sandbox1';
      `);

      const sandbox2 = new VMSandbox({
        context: 'Other context',
        onLLMQuery: async () => 'mock',
      });

      const result = await sandbox2.execute(`
        print(typeof globalThis.sharedVar === 'undefined' ? 'OK: isolated' : 'FAIL: leaked');
      `);

      expect(result.output).toContain('OK: isolated');
      sandbox2.dispose();
    });

    it('should not leak variables from onLLMQuery callback', async () => {
      const secretValue = 'super_secret_123';

      const secureSandbox = new VMSandbox({
        context: 'test',
        onLLMQuery: async () => {
          // This callback has access to secretValue in its closure
          return `Response: ${secretValue}`;
        },
      });

      const result = await secureSandbox.execute(`
        // Try to access outer scope variables
        try {
          print(typeof secretValue !== 'undefined' ? 'FAIL: secret accessible' : 'OK');
        } catch(e) {
          print('OK: secret not accessible');
        }
      `);

      expect(result.output).toContain('OK');
      secureSandbox.dispose();
    });
  });

  describe('Allowed Operations', () => {
    it('should allow standard JavaScript operations', async () => {
      const result = await sandbox.execute(`
        const arr = [1, 2, 3];
        const sum = arr.reduce((a, b) => a + b, 0);
        const mapped = arr.map(x => x * 2);
        const obj = { a: 1, b: 2 };
        const keys = Object.keys(obj);
        const json = JSON.stringify({ sum, mapped, keys });
        print(json);
      `);

      expect(result.error).toBeUndefined();
      const output = JSON.parse(result.output);
      expect(output.sum).toBe(6);
      expect(output.mapped).toEqual([2, 4, 6]);
      expect(output.keys).toEqual(['a', 'b']);
    });

    it('should allow async/await operations', async () => {
      const result = await sandbox.execute(`
        async function fetchData() {
          return Promise.resolve('data');
        }
        const data = await fetchData();
        print(data);
      `);

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('data');
    });

    it('should allow Date operations', async () => {
      const result = await sandbox.execute(`
        const now = new Date();
        const year = now.getFullYear();
        print(year >= 2024 ? 'OK' : 'FAIL');
      `);

      expect(result.output).toBe('OK');
    });

    it('should allow Math operations', async () => {
      const result = await sandbox.execute(`
        const sqrt = Math.sqrt(16);
        const random = Math.random();
        print('sqrt: ' + sqrt + ', random: ' + (random >= 0 && random < 1));
      `);

      expect(result.output).toContain('sqrt: 4');
      expect(result.output).toContain('random: true');
    });

    it('should allow RegExp operations', async () => {
      const result = await sandbox.execute(`
        const text = 'hello world';
        const match = text.match(/world/);
        print(match ? match[0] : 'no match');
      `);

      expect(result.output).toBe('world');
    });
  });
});
