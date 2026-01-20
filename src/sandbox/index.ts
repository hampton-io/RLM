import type { SandboxEnvironment } from '../types.js';
import type { SandboxConfig, SandboxFactory } from './types.js';
import { createVMSandbox } from './vm-sandbox.js';

export type { SandboxConfig, LLMQueryCallback, LLMQueryParallelCallback } from './types.js';
export { VMSandbox, createVMSandbox } from './vm-sandbox.js';

// Tools exports
export type {
  SandboxTool,
  ToolParameter,
  ToolCategory,
  ToolRegistry,
  FetchOptions,
  FetchResult,
  CSVParseOptions,
} from './tools.js';

export {
  // Built-in tools
  BUILTIN_TOOLS,
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
  createToolRegistry,
  defaultToolRegistry,
  getToolsHelp,
  validateTool,
  wrapToolFunction,
} from './tools.js';

/**
 * Supported sandbox types.
 */
export type SandboxType = 'vm';

/**
 * Create a sandbox of the specified type.
 */
export async function createSandbox(
  type: SandboxType,
  config: SandboxConfig
): Promise<SandboxEnvironment> {
  switch (type) {
    case 'vm':
      return createVMSandbox(config);
    default:
      throw new Error(`Unsupported sandbox type: ${type}`);
  }
}

/**
 * Get the default sandbox factory.
 */
export function getDefaultSandboxFactory(): SandboxFactory {
  return createVMSandbox;
}
