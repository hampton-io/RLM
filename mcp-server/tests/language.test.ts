/**
 * Language Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import {
  detectLanguage,
  isSupportedFile,
  getExtensionsForLanguage,
  extractSymbols,
  isComment,
  getLanguageDisplayName,
} from '../src/utils/language.js';

describe('Language Detection', () => {
  describe('detectLanguage', () => {
    it('should detect TypeScript files', () => {
      expect(detectLanguage('/path/to/file.ts')).toBe('typescript');
      expect(detectLanguage('/path/to/file.tsx')).toBe('typescript');
      expect(detectLanguage('/path/to/file.mts')).toBe('typescript');
      expect(detectLanguage('/path/to/file.cts')).toBe('typescript');
    });

    it('should detect JavaScript files', () => {
      expect(detectLanguage('/path/to/file.js')).toBe('javascript');
      expect(detectLanguage('/path/to/file.jsx')).toBe('javascript');
      expect(detectLanguage('/path/to/file.mjs')).toBe('javascript');
      expect(detectLanguage('/path/to/file.cjs')).toBe('javascript');
    });

    it('should detect Python files', () => {
      expect(detectLanguage('/path/to/file.py')).toBe('python');
      expect(detectLanguage('/path/to/file.pyi')).toBe('python');
    });

    it('should detect Go files', () => {
      expect(detectLanguage('/path/to/file.go')).toBe('go');
    });

    it('should detect Rust files', () => {
      expect(detectLanguage('/path/to/file.rs')).toBe('rust');
    });

    it('should detect Java files', () => {
      expect(detectLanguage('/path/to/file.java')).toBe('java');
    });

    it('should detect Kotlin files', () => {
      expect(detectLanguage('/path/to/file.kt')).toBe('kotlin');
      expect(detectLanguage('/path/to/file.kts')).toBe('kotlin');
    });

    it('should detect C files', () => {
      expect(detectLanguage('/path/to/file.c')).toBe('c');
      expect(detectLanguage('/path/to/file.h')).toBe('c');
    });

    it('should detect C++ files', () => {
      expect(detectLanguage('/path/to/file.cpp')).toBe('cpp');
      expect(detectLanguage('/path/to/file.cc')).toBe('cpp');
      expect(detectLanguage('/path/to/file.hpp')).toBe('cpp');
    });

    it('should return unknown for unsupported files', () => {
      expect(detectLanguage('/path/to/file.txt')).toBe('unknown');
      expect(detectLanguage('/path/to/file.md')).toBe('unknown');
      expect(detectLanguage('/path/to/file')).toBe('unknown');
    });
  });

  describe('isSupportedFile', () => {
    it('should return true for supported files', () => {
      expect(isSupportedFile('/path/to/file.ts')).toBe(true);
      expect(isSupportedFile('/path/to/file.py')).toBe(true);
      expect(isSupportedFile('/path/to/file.go')).toBe(true);
    });

    it('should return false for unsupported files', () => {
      expect(isSupportedFile('/path/to/file.txt')).toBe(false);
      expect(isSupportedFile('/path/to/file.md')).toBe(false);
      expect(isSupportedFile('/path/to/file.json')).toBe(false);
    });
  });

  describe('getExtensionsForLanguage', () => {
    it('should return extensions for TypeScript', () => {
      const extensions = getExtensionsForLanguage('typescript');
      expect(extensions).toContain('.ts');
      expect(extensions).toContain('.tsx');
    });

    it('should return extensions for Python', () => {
      const extensions = getExtensionsForLanguage('python');
      expect(extensions).toContain('.py');
    });

    it('should return empty array for unknown language', () => {
      const extensions = getExtensionsForLanguage('unknown');
      expect(extensions).toEqual([]);
    });
  });

  describe('getLanguageDisplayName', () => {
    it('should return display name for languages', () => {
      expect(getLanguageDisplayName('typescript')).toBe('TypeScript');
      expect(getLanguageDisplayName('javascript')).toBe('JavaScript');
      expect(getLanguageDisplayName('python')).toBe('Python');
      expect(getLanguageDisplayName('cpp')).toBe('C++');
      expect(getLanguageDisplayName('csharp')).toBe('C#');
    });
  });
});

describe('Symbol Extraction', () => {
  describe('TypeScript/JavaScript', () => {
    it('should extract function declarations', () => {
      const code = `
function normalFunction() {}
async function asyncFunction() {}
export function exportedFunction() {}
`;
      const symbols = extractSymbols(code, 'typescript');

      expect(symbols.some((s) => s.name === 'normalFunction')).toBe(true);
      expect(symbols.some((s) => s.name === 'asyncFunction')).toBe(true);
      expect(symbols.some((s) => s.name === 'exportedFunction')).toBe(true);
    });

    it('should extract arrow functions', () => {
      const code = `
const arrowFunc = () => {};
export const exportedArrow = (x: number) => x * 2;
`;
      const symbols = extractSymbols(code, 'typescript');

      expect(symbols.some((s) => s.name === 'arrowFunc')).toBe(true);
      expect(symbols.some((s) => s.name === 'exportedArrow')).toBe(true);
    });

    it('should extract class declarations', () => {
      const code = `
class NormalClass {}
abstract class AbstractClass {}
export class ExportedClass {}
`;
      const symbols = extractSymbols(code, 'typescript');

      expect(symbols.some((s) => s.name === 'NormalClass' && s.kind === 'class')).toBe(true);
      expect(symbols.some((s) => s.name === 'AbstractClass' && s.kind === 'class')).toBe(true);
      expect(symbols.some((s) => s.name === 'ExportedClass' && s.kind === 'class')).toBe(true);
    });

    it('should extract interface declarations', () => {
      const code = `
interface Config {}
export interface ExportedInterface {}
`;
      const symbols = extractSymbols(code, 'typescript');

      expect(symbols.some((s) => s.name === 'Config' && s.kind === 'interface')).toBe(true);
      expect(symbols.some((s) => s.name === 'ExportedInterface' && s.kind === 'interface')).toBe(true);
    });

    it('should extract type declarations', () => {
      const code = `
type MyType = string;
export type ExportedType = number;
`;
      const symbols = extractSymbols(code, 'typescript');

      expect(symbols.some((s) => s.name === 'MyType' && s.kind === 'type')).toBe(true);
      expect(symbols.some((s) => s.name === 'ExportedType' && s.kind === 'type')).toBe(true);
    });

    it('should extract enum declarations', () => {
      const code = `
enum Status {}
export enum ExportedEnum {}
`;
      const symbols = extractSymbols(code, 'typescript');

      expect(symbols.some((s) => s.name === 'Status' && s.kind === 'enum')).toBe(true);
      expect(symbols.some((s) => s.name === 'ExportedEnum' && s.kind === 'enum')).toBe(true);
    });
  });

  describe('Python', () => {
    it('should extract function definitions', () => {
      const code = `
def normal_function():
    pass

async def async_function():
    pass
`;
      const symbols = extractSymbols(code, 'python');

      expect(symbols.some((s) => s.name === 'normal_function')).toBe(true);
      expect(symbols.some((s) => s.name === 'async_function')).toBe(true);
    });

    it('should extract class definitions', () => {
      const code = `
class MyClass:
    pass
`;
      const symbols = extractSymbols(code, 'python');

      expect(symbols.some((s) => s.name === 'MyClass' && s.kind === 'class')).toBe(true);
    });
  });

  describe('Go', () => {
    it('should extract function definitions', () => {
      const code = `
func normalFunc() {}
func (r *Receiver) methodFunc() {}
`;
      const symbols = extractSymbols(code, 'go');

      expect(symbols.some((s) => s.name === 'normalFunc')).toBe(true);
      expect(symbols.some((s) => s.name === 'methodFunc')).toBe(true);
    });

    it('should extract type definitions', () => {
      const code = `
type Config struct {}
type Handler interface {}
`;
      const symbols = extractSymbols(code, 'go');

      expect(symbols.some((s) => s.name === 'Config' && s.kind === 'type')).toBe(true);
      expect(symbols.some((s) => s.name === 'Handler' && s.kind === 'type')).toBe(true);
    });
  });

  describe('Rust', () => {
    it('should extract function definitions', () => {
      const code = `
fn normal_fn() {}
pub fn public_fn() {}
async fn async_fn() {}
`;
      const symbols = extractSymbols(code, 'rust');

      expect(symbols.some((s) => s.name === 'normal_fn')).toBe(true);
      expect(symbols.some((s) => s.name === 'public_fn')).toBe(true);
      expect(symbols.some((s) => s.name === 'async_fn')).toBe(true);
    });

    it('should extract struct and enum definitions', () => {
      const code = `
struct Config {}
pub struct PublicConfig {}
enum Status {}
pub enum PublicStatus {}
`;
      const symbols = extractSymbols(code, 'rust');

      expect(symbols.some((s) => s.name === 'Config')).toBe(true);
      expect(symbols.some((s) => s.name === 'PublicConfig')).toBe(true);
      expect(symbols.some((s) => s.name === 'Status')).toBe(true);
      expect(symbols.some((s) => s.name === 'PublicStatus')).toBe(true);
    });
  });
});

describe('Comment Detection', () => {
  it('should detect single-line comments in TypeScript', () => {
    expect(isComment('// this is a comment', 'typescript')).toBe(true);
    expect(isComment('  // indented comment', 'typescript')).toBe(true);
    expect(isComment('const x = 1;', 'typescript')).toBe(false);
  });

  it('should detect single-line comments in Python', () => {
    expect(isComment('# this is a comment', 'python')).toBe(true);
    expect(isComment('  # indented comment', 'python')).toBe(true);
    expect(isComment('x = 1', 'python')).toBe(false);
  });
});
