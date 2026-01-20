import type { ParsedLLMOutput } from '../types.js';

/**
 * Regular expressions for parsing LLM output.
 */
const CODE_BLOCK_REGEX = /```(?:javascript|js|typescript|ts)?\n([\s\S]*?)```/g;
const FINAL_REGEX = /FINAL\s*\(\s*["'`]?([\s\S]*?)["'`]?\s*\)/;
const FINAL_VAR_REGEX = /FINAL_VAR\s*\(\s*["'`]?(\w+)["'`]?\s*\)/;

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

  // Check for FINAL() or FINAL_VAR() (can be inside or outside code blocks)
  const finalMatch = output.match(FINAL_REGEX);
  if (finalMatch) {
    result.final = {
      type: 'FINAL',
      value: finalMatch[1].trim(),
    };
    // Remove FINAL() from code if present
    if (result.code) {
      result.code = result.code.replace(FINAL_REGEX, '').trim();
    }
  }

  const finalVarMatch = output.match(FINAL_VAR_REGEX);
  if (finalVarMatch && !result.final) {
    result.final = {
      type: 'FINAL_VAR',
      value: finalVarMatch[1].trim(),
    };
    // Remove FINAL_VAR() from code if present, but keep the rest
    if (result.code) {
      result.code = result.code.replace(FINAL_VAR_REGEX, '').trim();
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
  return FINAL_REGEX.test(output) || FINAL_VAR_REGEX.test(output);
}

/**
 * Extract final answer from output.
 */
export function extractFinalAnswer(output: string): string | null {
  const finalMatch = output.match(FINAL_REGEX);
  if (finalMatch) {
    return finalMatch[1].trim();
  }

  const finalVarMatch = output.match(FINAL_VAR_REGEX);
  if (finalVarMatch) {
    return finalVarMatch[1].trim();
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
