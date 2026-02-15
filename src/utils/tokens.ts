/**
 * Token counting and cost estimation utilities.
 *
 * Provides accurate-enough token estimation for pre-execution cost prediction.
 * Uses provider-specific heuristics for different tokenizers.
 */

import type { SupportedModel, Message, ModelProvider } from '../types.js';
import { getTextFromContent } from '../types.js';
import { MODEL_PRICING, detectProvider } from '../clients/types.js';

// =============================================================================
// Types
// =============================================================================

export interface TokenEstimate {
  /** Estimated input/prompt tokens */
  inputTokens: number;
  /** Estimated output/completion tokens */
  outputTokens: number;
  /** Total estimated tokens */
  totalTokens: number;
  /** Estimation method used */
  method: 'heuristic' | 'tokenizer' | 'api';
}

export interface CostEstimate {
  /** Token estimates */
  tokens: TokenEstimate;
  /** Estimated cost in USD */
  cost: number;
  /** Cost breakdown */
  breakdown: {
    inputCost: number;
    outputCost: number;
  };
  /** Model used for estimation */
  model: string;
  /** Provider */
  provider: ModelProvider;
  /** Pricing used (per 1M tokens) */
  pricing: {
    inputPer1M: number;
    outputPer1M: number;
  };
}

export interface EstimateOptions {
  /** Expected output tokens (default: estimate based on query complexity) */
  expectedOutputTokens?: number;
  /** Output multiplier for estimating response length (default: 0.5) */
  outputMultiplier?: number;
  /** Include system prompt overhead (default: true) */
  includeSystemPrompt?: boolean;
  /** Estimated iterations for RLM execution (default: 3) */
  estimatedIterations?: number;
}

// =============================================================================
// Token Estimation
// =============================================================================

/**
 * Tokens per character ratio by provider.
 * These are empirically derived approximations:
 * - OpenAI cl100k_base: ~0.25 tokens/char (English text)
 * - Anthropic: ~0.27 tokens/char
 * - Google: ~0.26 tokens/char
 */
const TOKENS_PER_CHAR: Record<ModelProvider, number> = {
  openai: 0.25,
  anthropic: 0.27,
  google: 0.26,
};

/**
 * Overhead tokens for message formatting.
 * Each message has structural tokens (role, separators, etc.)
 */
const MESSAGE_OVERHEAD: Record<ModelProvider, number> = {
  openai: 4, // <|im_start|>role<|im_sep|>...<|im_end|>
  anthropic: 3, // Human:/Assistant: markers
  google: 2, // Role markers
};

/**
 * Base system prompt token estimate for RLM.
 */
const RLM_SYSTEM_PROMPT_TOKENS = 800;

/**
 * Estimate tokens for a string using provider-specific heuristics.
 */
export function estimateTokensForString(text: string, provider: ModelProvider = 'openai'): number {
  if (!text) return 0;

  const ratio = TOKENS_PER_CHAR[provider] ?? 0.25;

  // Count code blocks separately (they tend to have more tokens per char)
  const codeBlockRegex = /```[\s\S]*?```/g;
  const codeBlocks = text.match(codeBlockRegex) || [];
  let codeTokens = 0;

  for (const block of codeBlocks) {
    // Code tends to have ~0.35 tokens per char due to symbols/operators
    codeTokens += Math.ceil(block.length * 0.35);
  }

  // Remove code blocks from text for regular estimation
  const textWithoutCode = text.replace(codeBlockRegex, '');
  const textTokens = Math.ceil(textWithoutCode.length * ratio);

  return textTokens + codeTokens;
}

/**
 * Estimate tokens for a message array.
 */
export function estimateTokensForMessages(
  messages: Message[],
  provider: ModelProvider = 'openai'
): number {
  const overhead = MESSAGE_OVERHEAD[provider] ?? 4;
  let total = 0;

  for (const message of messages) {
    // Extract text from message content (handles both string and multimodal content)
    const textContent = getTextFromContent(message.content);
    total += estimateTokensForString(textContent, provider) + overhead;
  }

  // Add base overhead for the conversation
  total += 3; // priming tokens

  return total;
}

/**
 * Estimate input tokens for an RLM query.
 */
export function estimateInputTokens(
  query: string,
  context: string,
  model: SupportedModel,
  options: EstimateOptions = {}
): number {
  const provider = detectProvider(model);
  const { includeSystemPrompt = true } = options;

  let tokens = 0;

  // System prompt overhead
  if (includeSystemPrompt) {
    tokens += RLM_SYSTEM_PROMPT_TOKENS;
  }

  // Query tokens
  tokens += estimateTokensForString(query, provider);

  // Context tokens (this is usually the bulk)
  tokens += estimateTokensForString(context, provider);

  // Message formatting overhead
  tokens += MESSAGE_OVERHEAD[provider] * 2; // system + user message

  return tokens;
}

/**
 * Estimate output tokens based on query and context.
 */
export function estimateOutputTokens(
  query: string,
  context: string,
  model: SupportedModel,
  options: EstimateOptions = {}
): number {
  // If explicit output tokens provided, use those
  if (options.expectedOutputTokens !== undefined) {
    return options.expectedOutputTokens;
  }

  const provider = detectProvider(model);
  const { outputMultiplier = 0.5, estimatedIterations = 3 } = options;

  // Base estimate: query length * multiplier
  const queryTokens = estimateTokensForString(query, provider);
  const baseOutput = Math.max(queryTokens * outputMultiplier, 100);

  // RLM generates code, so expect more output per iteration
  // Each iteration: ~200 tokens for thinking + code + explanation
  const iterationTokens = 200 * estimatedIterations;

  // Scale slightly with context size (larger contexts = more analysis)
  const contextTokens = estimateTokensForString(context, provider);
  const contextScale = Math.min(Math.log10(contextTokens + 1) / 3, 1.5);

  return Math.ceil((baseOutput + iterationTokens) * contextScale);
}

/**
 * Get comprehensive token estimate for an RLM query.
 */
export function estimateTokens(
  query: string,
  context: string,
  model: SupportedModel,
  options: EstimateOptions = {}
): TokenEstimate {
  const inputTokens = estimateInputTokens(query, context, model, options);
  const outputTokens = estimateOutputTokens(query, context, model, options);

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    method: 'heuristic',
  };
}

// =============================================================================
// Cost Estimation
// =============================================================================

/**
 * Estimate cost for an RLM query before execution.
 */
export function estimateCost(
  query: string,
  context: string,
  model: SupportedModel,
  options: EstimateOptions = {}
): CostEstimate {
  const provider = detectProvider(model);
  const tokens = estimateTokens(query, context, model, options);

  // Get pricing for model
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    // Unknown model - use conservative estimate
    return {
      tokens,
      cost: 0,
      breakdown: { inputCost: 0, outputCost: 0 },
      model,
      provider,
      pricing: { inputPer1M: 0, outputPer1M: 0 },
    };
  }

  const inputCost = (tokens.inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (tokens.outputTokens / 1_000_000) * pricing.outputPer1M;

  return {
    tokens,
    cost: inputCost + outputCost,
    breakdown: { inputCost, outputCost },
    model,
    provider,
    pricing,
  };
}

/**
 * Estimate cost for multiple iterations (RLM typically runs multiple LLM calls).
 */
export function estimateTotalCost(
  query: string,
  context: string,
  model: SupportedModel,
  options: EstimateOptions & { iterations?: number } = {}
): CostEstimate {
  const { iterations = 3, ...estimateOptions } = options;

  const singleEstimate = estimateCost(query, context, model, {
    ...estimateOptions,
    estimatedIterations: 1,
  });

  // First iteration includes full context, subsequent iterations may include less
  // but also include code execution results
  const firstIterationCost = singleEstimate.cost;

  // Subsequent iterations: ~30% of first (code + smaller context in messages)
  const subsequentIterationCost = firstIterationCost * 0.3;
  const subsequentIterations = Math.max(iterations - 1, 0);

  const totalCost = firstIterationCost + subsequentIterationCost * subsequentIterations;

  // Recalculate tokens for total
  const totalInputTokens = Math.ceil(
    singleEstimate.tokens.inputTokens * (1 + subsequentIterations * 0.3)
  );
  const totalOutputTokens = singleEstimate.tokens.outputTokens * iterations;

  return {
    tokens: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      method: 'heuristic',
    },
    cost: totalCost,
    breakdown: {
      inputCost: (totalInputTokens / 1_000_000) * singleEstimate.pricing.inputPer1M,
      outputCost: (totalOutputTokens / 1_000_000) * singleEstimate.pricing.outputPer1M,
    },
    model,
    provider: singleEstimate.provider,
    pricing: singleEstimate.pricing,
  };
}

// =============================================================================
// Formatting Utilities
// =============================================================================

/**
 * Format a cost estimate for display.
 */
export function formatCostEstimate(estimate: CostEstimate): string {
  const lines = [
    `Model: ${estimate.model} (${estimate.provider})`,
    ``,
    `Token Estimate:`,
    `  Input:  ${estimate.tokens.inputTokens.toLocaleString()} tokens`,
    `  Output: ${estimate.tokens.outputTokens.toLocaleString()} tokens`,
    `  Total:  ${estimate.tokens.totalTokens.toLocaleString()} tokens`,
    ``,
    `Cost Estimate:`,
    `  Input:  $${estimate.breakdown.inputCost.toFixed(6)}`,
    `  Output: $${estimate.breakdown.outputCost.toFixed(6)}`,
    `  Total:  $${estimate.cost.toFixed(6)}`,
    ``,
    `Pricing (per 1M tokens):`,
    `  Input:  $${estimate.pricing.inputPer1M.toFixed(2)}`,
    `  Output: $${estimate.pricing.outputPer1M.toFixed(2)}`,
  ];

  return lines.join('\n');
}

/**
 * Format a brief cost summary.
 */
export function formatCostSummary(estimate: CostEstimate): string {
  return `~${estimate.tokens.totalTokens.toLocaleString()} tokens, ~$${estimate.cost.toFixed(4)}`;
}

// =============================================================================
// Model Comparison
// =============================================================================

/**
 * Compare cost estimates across multiple models.
 */
export function compareCosts(
  query: string,
  context: string,
  models: SupportedModel[],
  options: EstimateOptions = {}
): Array<CostEstimate & { rank: number }> {
  const estimates = models.map((model) => estimateTotalCost(query, context, model, options));

  // Sort by cost
  estimates.sort((a, b) => a.cost - b.cost);

  return estimates.map((estimate, index) => ({
    ...estimate,
    rank: index + 1,
  }));
}

/**
 * Get the cheapest model for a given query.
 */
export function getCheapestModel(
  query: string,
  context: string,
  models: SupportedModel[],
  options: EstimateOptions = {}
): { model: SupportedModel; estimate: CostEstimate } {
  const ranked = compareCosts(query, context, models, options);
  const cheapest = ranked[0];
  return {
    model: cheapest.model as SupportedModel,
    estimate: cheapest,
  };
}
