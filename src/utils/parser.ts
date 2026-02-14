import type { ParsedLLMOutput } from '../types.js';

/**
 * Regular expressions for parsing LLM output.
 */
const CODE_BLOCK_REGEX = /```(?:javascript|js|typescript|ts)?\n([\s\S]*?)```/g;
// Simple regex for quoted string arguments only (avoids nested paren issues)
const FINAL_SIMPLE_REGEX = /FINAL\s*\(\s*["'`]([^"'`]*)["'`]\s*\)/;
const FINAL_VAR_REGEX = /FINAL_VAR\s*\(\s*["'`]?(\w+)["'`]?\s*\)/;

/**
 * Find a balanced FINAL() or FINAL_VAR() call, handling nested parentheses.
 * Returns the full match and the inner content.
 */
function findBalancedFinalCall(text: string, funcName: 'FINAL' | 'FINAL_VAR'): { match: string; content: string; index: number } | null {
  const startRegex = new RegExp(`${funcName}\\s*\\(`);
  const startMatch = text.match(startRegex);
  if (!startMatch || startMatch.index === undefined) return null;

  const startIndex = startMatch.index;
  const parenStart = startIndex + startMatch[0].length - 1; // Position of opening (
  
  let depth = 1;
  let i = parenStart + 1;
  
  while (i < text.length && depth > 0) {
    const char = text[i];
    if (char === '(') depth++;
    else if (char === ')') depth--;
    // Skip string contents
    else if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      i++;
      while (i < text.length && text[i] !== quote) {
        if (text[i] === '\\') i++; // Skip escaped chars
        i++;
      }
    }
    i++;
  }

  if (depth !== 0) return null; // Unbalanced

  const fullMatch = text.slice(startIndex, i);
  const content = text.slice(parenStart + 1, i - 1).trim();
  
  return { match: fullMatch, content, index: startIndex };
}

/**
 * Parse LLM output to extract code blocks and final answers.
 */
export function parseLLMOutput(output: string): ParsedLLMOutput {
  const result: ParsedLLMOutput = {
    raw: output,
  };

  // Extract code blocks first
  const codeBlocks: string[] = [];
  let match;
  while ((match = CODE_BLOCK_REGEX.exec(output)) !== null) {
    codeBlocks.push(match[1].trim());
  }

  if (codeBlocks.length > 0) {
    // Join multiple code blocks with newlines
    result.code = codeBlocks.join('\n\n');
  }

  // Check for FINAL() or FINAL_VAR() using balanced parenthesis matching
  // This handles cases like FINAL(String(result)) correctly
  const finalCall = findBalancedFinalCall(output, 'FINAL');
  if (finalCall) {
    // Extract the value, stripping outer quotes if present
    let value = finalCall.content;
    const quoteMatch = value.match(/^["'`]([\s\S]*)["'`]$/);
    if (quoteMatch) {
      value = quoteMatch[1];
    }
    
    result.final = {
      type: 'FINAL',
      value: value.trim(),
    };
    
    // Only remove FINAL() from code if it's NOT inside a code block
    // When FINAL() is inside a code block, it should be left for the sandbox to execute
    if (result.code) {
      // Check if the FINAL() call is inside a code block by seeing if it appears in the raw code
      // If it does, leave it in for execution; if not, remove it
      const isInCodeBlock = output.includes('```') && output.includes(finalCall.match);
      if (!isInCodeBlock) {
        result.code = result.code.replace(finalCall.match, '').trim();
        // Clean up any trailing semicolons left alone on a line
        result.code = result.code.replace(/^\s*;\s*$/gm, '').trim();
      }
    }
  }

  const finalVarCall = findBalancedFinalCall(output, 'FINAL_VAR');
  if (finalVarCall && !result.final) {
    let value = finalVarCall.content;
    const quoteMatch = value.match(/^["'`]?(\w+)["'`]?$/);
    if (quoteMatch) {
      value = quoteMatch[1];
    }
    
    result.final = {
      type: 'FINAL_VAR',
      value: value.trim(),
    };
    
    // Only remove FINAL_VAR() from code if it's NOT inside a code block
    if (result.code) {
      const isInCodeBlock = output.includes('```') && output.includes(finalVarCall.match);
      if (!isInCodeBlock) {
        result.code = result.code.replace(finalVarCall.match, '').trim();
        result.code = result.code.replace(/^\s*;\s*$/gm, '').trim();
      }
    }
  }

  // Everything before the first code block is considered "thinking"
  const firstCodeBlockIndex = output.search(/```/);
  if (firstCodeBlockIndex > 0) {
    const thinking = output.slice(0, firstCodeBlockIndex).trim();
    if (thinking) {
      result.thinking = thinking;
    }
  }

  return result;
}

/**
 * Check if output contains a final answer.
 */
export function hasFinalAnswer(output: string): boolean {
  return findBalancedFinalCall(output, 'FINAL') !== null || 
         findBalancedFinalCall(output, 'FINAL_VAR') !== null;
}

/**
 * Extract final answer from output.
 */
export function extractFinalAnswer(output: string): string | null {
  const finalCall = findBalancedFinalCall(output, 'FINAL');
  if (finalCall) {
    let value = finalCall.content;
    const quoteMatch = value.match(/^["'`]([\s\S]*)["'`]$/);
    if (quoteMatch) {
      value = quoteMatch[1];
    }
    return value.trim();
  }

  const finalVarCall = findBalancedFinalCall(output, 'FINAL_VAR');
  if (finalVarCall) {
    let value = finalVarCall.content;
    const quoteMatch = value.match(/^["'`]?(\w+)["'`]?$/);
    if (quoteMatch) {
      value = quoteMatch[1];
    }
    return value.trim();
  }

  return null;
}

/**
 * Extract all code blocks from output.
 */
export function extractCodeBlocks(output: string): string[] {
  const blocks: string[] = [];
  let match;
  const regex = new RegExp(CODE_BLOCK_REGEX.source, 'g');
  while ((match = regex.exec(output)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

/**
 * Check if output contains code blocks.
 */
export function hasCodeBlocks(output: string): boolean {
  // Use a fresh regex to avoid state issues with the global flag
  const regex = /```(?:javascript|js|typescript|ts)?\n[\s\S]*?```/;
  return regex.test(output);
}

/**
 * Strip code block markers from a string.
 */
export function stripCodeBlockMarkers(code: string): string {
  return code
    .replace(/^```(?:javascript|js|typescript|ts)?\n?/gm, '')
    .replace(/\n?```$/gm, '')
    .trim();
}
