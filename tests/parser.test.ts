import { describe, it, expect } from 'vitest';
import {
  parseLLMOutput,
  hasFinalAnswer,
  extractFinalAnswer,
  extractCodeBlocks,
  hasCodeBlocks,
} from '../src/utils/parser.js';

describe('parseLLMOutput', () => {
  it('should parse FINAL() output', () => {
    const output = 'Some thinking here.\n\nFINAL("The answer is 42")';
    const result = parseLLMOutput(output);

    expect(result.final).toBeDefined();
    expect(result.final?.type).toBe('FINAL');
    expect(result.final?.value).toBe('The answer is 42');
  });

  it('should parse FINAL_VAR() output', () => {
    const output = 'Computing result...\n\nFINAL_VAR("resultVariable")';
    const result = parseLLMOutput(output);

    expect(result.final).toBeDefined();
    expect(result.final?.type).toBe('FINAL_VAR');
    expect(result.final?.value).toBe('resultVariable');
  });

  it('should extract code blocks', () => {
    const output = `Let me check the context.

\`\`\`javascript
const length = len(context);
print("Length:", length);
\`\`\`

Now I'll search for patterns.`;

    const result = parseLLMOutput(output);

    expect(result.code).toBeDefined();
    expect(result.code).toContain('const length = len(context)');
    expect(result.thinking).toBe('Let me check the context.');
  });

  it('should handle multiple code blocks', () => {
    const output = `First block:

\`\`\`javascript
const a = 1;
\`\`\`

Second block:

\`\`\`js
const b = 2;
\`\`\``;

    const result = parseLLMOutput(output);

    expect(result.code).toContain('const a = 1');
    expect(result.code).toContain('const b = 2');
  });

  it('should return raw output when no special content', () => {
    const output = 'Just some plain text without code or final answer.';
    const result = parseLLMOutput(output);

    expect(result.raw).toBe(output);
    expect(result.code).toBeUndefined();
    expect(result.final).toBeUndefined();
  });
});

describe('hasFinalAnswer', () => {
  it('should return true for FINAL()', () => {
    expect(hasFinalAnswer('FINAL("answer")')).toBe(true);
    expect(hasFinalAnswer('Some text FINAL("answer") more text')).toBe(true);
  });

  it('should return true for FINAL_VAR()', () => {
    expect(hasFinalAnswer('FINAL_VAR("myVar")')).toBe(true);
    expect(hasFinalAnswer('Some text FINAL_VAR("myVar") more text')).toBe(true);
  });

  it('should return false when no final answer', () => {
    expect(hasFinalAnswer('Just regular text')).toBe(false);
    expect(hasFinalAnswer('Almost FINAL but not quite')).toBe(false);
  });
});

describe('extractFinalAnswer', () => {
  it('should extract FINAL value', () => {
    expect(extractFinalAnswer('FINAL("Hello World")')).toBe('Hello World');
    expect(extractFinalAnswer("FINAL('Single quotes')")).toBe('Single quotes');
  });

  it('should extract FINAL_VAR value', () => {
    expect(extractFinalAnswer('FINAL_VAR("myResult")')).toBe('myResult');
    expect(extractFinalAnswer('FINAL_VAR(result)')).toBe('result');
  });

  it('should return null when no final answer', () => {
    expect(extractFinalAnswer('No final here')).toBeNull();
  });
});

describe('extractCodeBlocks', () => {
  it('should extract all code blocks', () => {
    const output = `
\`\`\`javascript
const a = 1;
\`\`\`

\`\`\`typescript
const b: number = 2;
\`\`\`

\`\`\`
const c = 3;
\`\`\`
`;

    const blocks = extractCodeBlocks(output);

    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toBe('const a = 1;');
    expect(blocks[1]).toBe('const b: number = 2;');
    expect(blocks[2]).toBe('const c = 3;');
  });

  it('should return empty array when no code blocks', () => {
    expect(extractCodeBlocks('No code here')).toHaveLength(0);
  });
});

describe('hasCodeBlocks', () => {
  it('should return true when code blocks present', () => {
    expect(hasCodeBlocks('```js\ncode\n```')).toBe(true);
    expect(hasCodeBlocks('```\ncode\n```')).toBe(true);
  });

  it('should return false when no code blocks', () => {
    expect(hasCodeBlocks('No code blocks')).toBe(false);
  });
});
