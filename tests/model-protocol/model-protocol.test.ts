/**
 * Model Protocol Compliance Tests
 * 
 * Tests whether different LLM models correctly follow the RLM protocol:
 * - Proper FINAL() / FINAL_VAR() usage
 * - Code block execution
 * - Variable persistence with store()/get()
 * - Context exploration functions
 * 
 * Run with: npx vitest run tests/model-protocol/model-protocol.test.ts
 * Or specific model: MODEL=gpt-5.2 npx vitest run tests/model-protocol/model-protocol.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { RLMExecutor } from '../../src/executor.js';
import * as fs from 'fs';
import * as path from 'path';

// Models to test - can be overridden with MODEL env var
const MODELS_TO_TEST = process.env.MODEL 
  ? [process.env.MODEL]
  : [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-5.2',
    'claude-sonnet-4-5',
    'claude-haiku-4-5',
    'gemini-2.0-flash',
  ];

// Test contexts of varying sizes
const SMALL_CONTEXT = `
Name: Alice Johnson
Age: 32
Occupation: Software Engineer
Location: San Francisco, CA
Hobbies: hiking, photography, cooking
Favorite Book: "The Pragmatic Programmer"
`.trim();

const MEDIUM_CONTEXT = fs.existsSync(path.join(__dirname, 'war-and-peace.txt'))
  ? fs.readFileSync(path.join(__dirname, 'war-and-peace.txt'), 'utf-8').slice(0, 50000)
  : 'Medium context not available';

const LARGE_CONTEXT = fs.existsSync(path.join(__dirname, 'war-and-peace.txt'))
  ? fs.readFileSync(path.join(__dirname, 'war-and-peace.txt'), 'utf-8')
  : 'Large context not available';

interface TestResult {
  model: string;
  testName: string;
  passed: boolean;
  answer: string | null;
  error: string | null;
  iterations: number;
  tokens: number;
  timeMs: number;
}

const results: TestResult[] = [];

function recordResult(result: TestResult) {
  results.push(result);
  console.log(`[${result.model}] ${result.testName}: ${result.passed ? 'PASS' : 'FAIL'}`);
  if (!result.passed) {
    console.log(`  Answer: ${result.answer?.slice(0, 100)}...`);
    console.log(`  Error: ${result.error}`);
  }
}

describe.each(MODELS_TO_TEST)('Model Protocol: %s', (model) => {
  let executor: RLMExecutor;
  
  beforeAll(() => {
    executor = new RLMExecutor({
      model: model as any,
      maxIterations: 5,
      verbose: false,
    });
  });

  describe('Basic Protocol Compliance', () => {
    it('should answer simple questions with FINAL()', async () => {
      const start = Date.now();
      try {
        const result = await executor.execute(
          'What is 2 + 2? Reply with just the number.',
          '',
          {}
        );
        
        const passed = result.answer === '4' || result.answer?.includes('4');
        recordResult({
          model,
          testName: 'simple_math',
          passed,
          answer: result.answer,
          error: passed ? null : 'Expected answer to contain "4"',
          iterations: result.iterations,
          tokens: result.usage.totalTokens,
          timeMs: Date.now() - start,
        });
        
        expect(passed).toBe(true);
      } catch (e) {
        recordResult({
          model,
          testName: 'simple_math',
          passed: false,
          answer: null,
          error: e instanceof Error ? e.message : String(e),
          iterations: 0,
          tokens: 0,
          timeMs: Date.now() - start,
        });
        throw e;
      }
    }, 30000);

    it('should extract data from small context', async () => {
      const start = Date.now();
      try {
        const result = await executor.execute(
          'What is the person\'s occupation?',
          SMALL_CONTEXT,
          {}
        );
        
        const passed = result.answer?.toLowerCase().includes('software engineer') ?? false;
        recordResult({
          model,
          testName: 'small_context_extraction',
          passed,
          answer: result.answer,
          error: passed ? null : 'Expected answer to contain "software engineer"',
          iterations: result.iterations,
          tokens: result.usage.totalTokens,
          timeMs: Date.now() - start,
        });
        
        expect(passed).toBe(true);
      } catch (e) {
        recordResult({
          model,
          testName: 'small_context_extraction',
          passed: false,
          answer: null,
          error: e instanceof Error ? e.message : String(e),
          iterations: 0,
          tokens: 0,
          timeMs: Date.now() - start,
        });
        throw e;
      }
    }, 30000);

    it('should use grep() to search context', async () => {
      const start = Date.now();
      try {
        const result = await executor.execute(
          'Find all lines containing "Alice" using grep(). Return the count.',
          SMALL_CONTEXT,
          {}
        );
        
        // Should find at least 1 line with "Alice"
        const hasNumber = /\d+/.test(result.answer ?? '');
        const passed = hasNumber && (result.answer?.includes('1') ?? false);
        recordResult({
          model,
          testName: 'grep_usage',
          passed,
          answer: result.answer,
          error: passed ? null : 'Expected answer to contain count "1"',
          iterations: result.iterations,
          tokens: result.usage.totalTokens,
          timeMs: Date.now() - start,
        });
        
        expect(passed).toBe(true);
      } catch (e) {
        recordResult({
          model,
          testName: 'grep_usage',
          passed: false,
          answer: null,
          error: e instanceof Error ? e.message : String(e),
          iterations: 0,
          tokens: 0,
          timeMs: Date.now() - start,
        });
        throw e;
      }
    }, 30000);
  });

  describe('Code Execution', () => {
    it('should execute JavaScript code blocks', async () => {
      const start = Date.now();
      try {
        const result = await executor.execute(
          'Calculate the factorial of 5 using a loop. Show your work with print() then FINAL() the result.',
          '',
          {}
        );
        
        const passed = result.answer?.includes('120') ?? false;
        recordResult({
          model,
          testName: 'code_execution_factorial',
          passed,
          answer: result.answer,
          error: passed ? null : 'Expected answer to contain "120"',
          iterations: result.iterations,
          tokens: result.usage.totalTokens,
          timeMs: Date.now() - start,
        });
        
        expect(passed).toBe(true);
      } catch (e) {
        recordResult({
          model,
          testName: 'code_execution_factorial',
          passed: false,
          answer: null,
          error: e instanceof Error ? e.message : String(e),
          iterations: 0,
          tokens: 0,
          timeMs: Date.now() - start,
        });
        throw e;
      }
    }, 30000);

    it('should use store()/get() for persistence', async () => {
      const start = Date.now();
      try {
        const result = await executor.execute(
          'In the first code block, store("myValue", 42). In the second code block, retrieve it with get("myValue") and add 8 to it. FINAL() the result.',
          '',
          {}
        );
        
        const passed = result.answer?.includes('50') ?? false;
        recordResult({
          model,
          testName: 'store_get_persistence',
          passed,
          answer: result.answer,
          error: passed ? null : 'Expected answer to contain "50"',
          iterations: result.iterations,
          tokens: result.usage.totalTokens,
          timeMs: Date.now() - start,
        });
        
        expect(passed).toBe(true);
      } catch (e) {
        recordResult({
          model,
          testName: 'store_get_persistence',
          passed: false,
          answer: null,
          error: e instanceof Error ? e.message : String(e),
          iterations: 0,
          tokens: 0,
          timeMs: Date.now() - start,
        });
        throw e;
      }
    }, 60000);
  });

  describe('Medium Context Handling', () => {
    it('should explore context length', async () => {
      const start = Date.now();
      try {
        const result = await executor.execute(
          'What is the length of the context in characters? Use len(context) and FINAL() the number.',
          MEDIUM_CONTEXT,
          {}
        );
        
        // Should report ~50000 characters
        const num = parseInt(result.answer?.replace(/\D/g, '') ?? '0');
        const passed = num > 40000 && num < 60000;
        recordResult({
          model,
          testName: 'context_length',
          passed,
          answer: result.answer,
          error: passed ? null : `Expected ~50000, got ${num}`,
          iterations: result.iterations,
          tokens: result.usage.totalTokens,
          timeMs: Date.now() - start,
        });
        
        expect(passed).toBe(true);
      } catch (e) {
        recordResult({
          model,
          testName: 'context_length',
          passed: false,
          answer: null,
          error: e instanceof Error ? e.message : String(e),
          iterations: 0,
          tokens: 0,
          timeMs: Date.now() - start,
        });
        throw e;
      }
    }, 60000);

    it('should find specific text in medium context', async () => {
      const start = Date.now();
      try {
        const result = await executor.execute(
          'Search the context for mentions of "Moscow" or "Russia". How many lines contain these words? Use grep().',
          MEDIUM_CONTEXT,
          {}
        );
        
        // Should find some matches
        const hasNumber = /\d+/.test(result.answer ?? '');
        const num = parseInt(result.answer?.match(/\d+/)?.[0] ?? '0');
        const passed = hasNumber && num > 0;
        recordResult({
          model,
          testName: 'medium_context_search',
          passed,
          answer: result.answer,
          error: passed ? null : 'Expected to find matches',
          iterations: result.iterations,
          tokens: result.usage.totalTokens,
          timeMs: Date.now() - start,
        });
        
        expect(passed).toBe(true);
      } catch (e) {
        recordResult({
          model,
          testName: 'medium_context_search',
          passed: false,
          answer: null,
          error: e instanceof Error ? e.message : String(e),
          iterations: 0,
          tokens: 0,
          timeMs: Date.now() - start,
        });
        throw e;
      }
    }, 60000);
  });

  describe('Output Format Validation', () => {
    it('should not output raw JavaScript code as final answer', async () => {
      const start = Date.now();
      try {
        const result = await executor.execute(
          'What is the capital of France?',
          '',
          {}
        );
        
        // Check for common code artifacts that indicate protocol failure
        const codeArtifacts = [
          'toString(',
          'String(',
          'FINAL(',
          'FINAL_VAR(',
          'console.log',
          'print(',
          '=>',
          'const ',
          'let ',
          'var ',
          'function',
        ];
        
        const hasCodeArtifacts = codeArtifacts.some(a => result.answer?.includes(a));
        const hasValidAnswer = result.answer?.toLowerCase().includes('paris') ?? false;
        const passed = hasValidAnswer && !hasCodeArtifacts;
        
        recordResult({
          model,
          testName: 'no_code_in_answer',
          passed,
          answer: result.answer,
          error: passed ? null : hasCodeArtifacts ? 'Answer contains code artifacts' : 'Answer does not contain Paris',
          iterations: result.iterations,
          tokens: result.usage.totalTokens,
          timeMs: Date.now() - start,
        });
        
        expect(passed).toBe(true);
      } catch (e) {
        recordResult({
          model,
          testName: 'no_code_in_answer',
          passed: false,
          answer: null,
          error: e instanceof Error ? e.message : String(e),
          iterations: 0,
          tokens: 0,
          timeMs: Date.now() - start,
        });
        throw e;
      }
    }, 30000);

    it('should provide coherent multi-sentence answers', async () => {
      const start = Date.now();
      try {
        const result = await executor.execute(
          'Explain in 2-3 sentences why water is important for life.',
          '',
          {}
        );
        
        // Check for coherent answer
        const hasMinLength = (result.answer?.length ?? 0) > 50;
        const hasWords = (result.answer?.split(' ').length ?? 0) > 10;
        const noCodeArtifacts = !['toString(', 'String(', '=>'].some(a => result.answer?.includes(a));
        const passed = hasMinLength && hasWords && noCodeArtifacts;
        
        recordResult({
          model,
          testName: 'coherent_explanation',
          passed,
          answer: result.answer,
          error: passed ? null : 'Answer not coherent or contains code',
          iterations: result.iterations,
          tokens: result.usage.totalTokens,
          timeMs: Date.now() - start,
        });
        
        expect(passed).toBe(true);
      } catch (e) {
        recordResult({
          model,
          testName: 'coherent_explanation',
          passed: false,
          answer: null,
          error: e instanceof Error ? e.message : String(e),
          iterations: 0,
          tokens: 0,
          timeMs: Date.now() - start,
        });
        throw e;
      }
    }, 30000);
  });
});

// Print summary after all tests
afterAll(() => {
  console.log('\n\n=== MODEL PROTOCOL TEST SUMMARY ===\n');
  
  const byModel = new Map<string, TestResult[]>();
  for (const r of results) {
    if (!byModel.has(r.model)) byModel.set(r.model, []);
    byModel.get(r.model)!.push(r);
  }
  
  for (const [model, modelResults] of byModel) {
    const passed = modelResults.filter(r => r.passed).length;
    const total = modelResults.length;
    const avgTime = Math.round(modelResults.reduce((s, r) => s + r.timeMs, 0) / total);
    const totalTokens = modelResults.reduce((s, r) => s + r.tokens, 0);
    
    console.log(`${model}:`);
    console.log(`  Pass rate: ${passed}/${total} (${Math.round(passed/total*100)}%)`);
    console.log(`  Avg time: ${avgTime}ms`);
    console.log(`  Total tokens: ${totalTokens}`);
    
    const failures = modelResults.filter(r => !r.passed);
    if (failures.length > 0) {
      console.log(`  Failures:`);
      for (const f of failures) {
        console.log(`    - ${f.testName}: ${f.error}`);
        console.log(`      Got: "${f.answer?.slice(0, 80)}..."`);
      }
    }
    console.log('');
  }
});

// Import afterAll from vitest at the top level
import { afterAll } from 'vitest';
