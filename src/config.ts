import type { RLMOptions, SupportedModel, ModelProvider } from './types.js';
import { detectProvider } from './clients/types.js';
import { invalidConfigError } from './utils/errors.js';

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG = {
  model: 'gpt-5.2' as SupportedModel,
  maxIterations: 20,
  maxDepth: 1,
  sandboxTimeout: 30000,
  verbose: false,
  temperature: 0,
  maxCost: undefined as number | undefined, // No limit by default
  maxTokens: undefined as number | undefined, // No limit by default
} as const;

/**
 * Environment variable names.
 */
export const ENV_VARS = {
  OPENAI_API_KEY: 'OPENAI_API_KEY',
  ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY',
  GOOGLE_API_KEY: 'GOOGLE_API_KEY',
  GEMINI_API_KEY: 'GEMINI_API_KEY',
  RLM_DEFAULT_MODEL: 'RLM_DEFAULT_MODEL',
  RLM_VERBOSE: 'RLM_VERBOSE',
  RLM_MAX_ITERATIONS: 'RLM_MAX_ITERATIONS',
  RLM_MAX_DEPTH: 'RLM_MAX_DEPTH',
  RLM_SANDBOX_TIMEOUT: 'RLM_SANDBOX_TIMEOUT',
  RLM_MAX_COST: 'RLM_MAX_COST',
  RLM_MAX_TOKENS: 'RLM_MAX_TOKENS',
} as const;

/**
 * Extended RLM options with cost controls.
 */
export interface RLMConfigOptions extends RLMOptions {
  /** Maximum cost in USD before stopping (optional) */
  maxCost?: number;
  /** Maximum total tokens before stopping (optional) */
  maxTokens?: number;
}

/**
 * Resolved configuration with all values set.
 */
export interface ResolvedConfig {
  model: SupportedModel;
  provider: ModelProvider;
  apiKey: string;
  maxIterations: number;
  maxDepth: number;
  sandboxTimeout: number;
  verbose: boolean;
  temperature: number;
  maxCost?: number;
  maxTokens?: number;
}

/**
 * Load configuration from environment variables.
 */
export function loadEnvConfig(): Partial<RLMConfigOptions> {
  const config: Partial<RLMConfigOptions> = {};

  // Model
  const model = process.env[ENV_VARS.RLM_DEFAULT_MODEL];
  if (model) {
    config.model = model as SupportedModel;
  }

  // Verbose
  const verbose = process.env[ENV_VARS.RLM_VERBOSE];
  if (verbose) {
    config.verbose = verbose.toLowerCase() === 'true';
  }

  // Max iterations
  const maxIterations = process.env[ENV_VARS.RLM_MAX_ITERATIONS];
  if (maxIterations) {
    const parsed = parseInt(maxIterations, 10);
    if (!isNaN(parsed)) config.maxIterations = parsed;
  }

  // Max depth
  const maxDepth = process.env[ENV_VARS.RLM_MAX_DEPTH];
  if (maxDepth) {
    const parsed = parseInt(maxDepth, 10);
    if (!isNaN(parsed)) config.maxDepth = parsed;
  }

  // Sandbox timeout
  const sandboxTimeout = process.env[ENV_VARS.RLM_SANDBOX_TIMEOUT];
  if (sandboxTimeout) {
    const parsed = parseInt(sandboxTimeout, 10);
    if (!isNaN(parsed)) config.sandboxTimeout = parsed;
  }

  // Max cost
  const maxCost = process.env[ENV_VARS.RLM_MAX_COST];
  if (maxCost) {
    const parsed = parseFloat(maxCost);
    if (!isNaN(parsed)) config.maxCost = parsed;
  }

  // Max tokens
  const maxTokens = process.env[ENV_VARS.RLM_MAX_TOKENS];
  if (maxTokens) {
    const parsed = parseInt(maxTokens, 10);
    if (!isNaN(parsed)) config.maxTokens = parsed;
  }

  return config;
}

/**
 * Get the API key for a provider.
 */
export function getApiKey(provider: ModelProvider, explicitKey?: string): string {
  if (explicitKey) {
    return explicitKey;
  }

  let envVar: string;
  let key: string | undefined;

  switch (provider) {
    case 'openai':
      envVar = ENV_VARS.OPENAI_API_KEY;
      key = process.env[envVar];
      break;
    case 'anthropic':
      envVar = ENV_VARS.ANTHROPIC_API_KEY;
      key = process.env[envVar];
      break;
    case 'google':
      // Try GOOGLE_API_KEY first, then GEMINI_API_KEY
      envVar = ENV_VARS.GOOGLE_API_KEY;
      key = process.env[ENV_VARS.GOOGLE_API_KEY] || process.env[ENV_VARS.GEMINI_API_KEY];
      if (!key) {
        envVar = `${ENV_VARS.GOOGLE_API_KEY} or ${ENV_VARS.GEMINI_API_KEY}`;
      }
      break;
    default:
      throw invalidConfigError(`Unknown provider: ${provider}`);
  }

  if (!key) {
    throw invalidConfigError(
      `No API key found for ${provider}. Set ${envVar} environment variable or pass apiKey in options.`
    );
  }

  return key;
}

/**
 * Resolve and validate configuration.
 */
export function resolveConfig(options: RLMConfigOptions): ResolvedConfig {
  // Load env config first, then override with explicit options
  const envConfig = loadEnvConfig();
  
  // Filter out undefined values from options so they don't override defaults
  const filteredOptions = Object.fromEntries(
    Object.entries(options).filter(([_, v]) => v !== undefined)
  );
  
  const merged = { ...DEFAULT_CONFIG, ...envConfig, ...filteredOptions };

  // Validate model
  if (!merged.model) {
    throw invalidConfigError('Model is required');
  }

  // Detect provider
  const provider = merged.provider ?? detectProvider(merged.model);

  // Get API key
  const apiKey = getApiKey(provider, merged.apiKey);

  // Validate numeric options
  if (merged.maxIterations < 1) {
    throw invalidConfigError('maxIterations must be at least 1');
  }

  if (merged.maxDepth < 0) {
    throw invalidConfigError('maxDepth must be non-negative');
  }

  if (merged.sandboxTimeout < 1000) {
    throw invalidConfigError('sandboxTimeout must be at least 1000ms');
  }

  if (merged.temperature < 0 || merged.temperature > 2) {
    throw invalidConfigError('temperature must be between 0 and 2');
  }

  if (merged.maxCost !== undefined && merged.maxCost <= 0) {
    throw invalidConfigError('maxCost must be positive');
  }

  if (merged.maxTokens !== undefined && merged.maxTokens <= 0) {
    throw invalidConfigError('maxTokens must be positive');
  }

  return {
    model: merged.model,
    provider,
    apiKey,
    maxIterations: merged.maxIterations,
    maxDepth: merged.maxDepth,
    sandboxTimeout: merged.sandboxTimeout,
    verbose: merged.verbose,
    temperature: merged.temperature,
    maxCost: merged.maxCost,
    maxTokens: merged.maxTokens,
  };
}

/**
 * Check if we have valid credentials for at least one provider.
 */
export function hasValidCredentials(): { openai: boolean; anthropic: boolean; google: boolean } {
  return {
    openai: !!process.env[ENV_VARS.OPENAI_API_KEY],
    anthropic: !!process.env[ENV_VARS.ANTHROPIC_API_KEY],
    google: !!(process.env[ENV_VARS.GOOGLE_API_KEY] || process.env[ENV_VARS.GEMINI_API_KEY]),
  };
}

/**
 * Get a summary of current configuration.
 */
export function getConfigSummary(config: ResolvedConfig): string {
  const lines = [
    `Model: ${config.model} (${config.provider})`,
    `Max Iterations: ${config.maxIterations}`,
    `Max Depth: ${config.maxDepth}`,
    `Sandbox Timeout: ${config.sandboxTimeout}ms`,
    `Temperature: ${config.temperature}`,
  ];

  if (config.maxCost) {
    lines.push(`Max Cost: $${config.maxCost.toFixed(4)}`);
  }

  if (config.maxTokens) {
    lines.push(`Max Tokens: ${config.maxTokens.toLocaleString()}`);
  }

  return lines.join('\n');
}
