import { RLMError, RLMErrorCode } from '../types.js';

export { RLMError } from '../types.js';

/**
 * User-friendly error suggestions for common issues.
 */
const ERROR_SUGGESTIONS: Record<RLMErrorCode, string> = {
  SANDBOX_TIMEOUT: 'Try increasing the sandboxTimeout option, or simplify your code to run faster.',
  SANDBOX_ERROR: 'Check your JavaScript code for syntax errors or invalid operations.',
  LLM_ERROR: 'Check your API key and network connection. If the issue persists, try again later.',
  MAX_ITERATIONS:
    'The LLM may be stuck in a loop. Try rephrasing your query or increasing maxIterations.',
  MAX_DEPTH:
    'Your query requires too many nested sub-queries. Try simplifying the task or increasing maxDepth.',
  PARSE_ERROR: 'The LLM response was malformed. Try rephrasing your query.',
  INVALID_CONFIG: 'Check your configuration options for typos or invalid values.',
  METRICS_STORE_ERROR:
    'The metrics storage backend encountered an error. Check the store connection and configuration.',
};

/**
 * Format an error with user-friendly message and suggestion.
 */
export function formatErrorMessage(code: RLMErrorCode, message: string): string {
  const suggestion = ERROR_SUGGESTIONS[code];
  return suggestion ? `${message}\n\nSuggestion: ${suggestion}` : message;
}

/**
 * Create a sandbox timeout error.
 */
export function sandboxTimeoutError(timeout: number): RLMError {
  const message = `Sandbox execution timed out after ${timeout}ms`;
  const error = new RLMError(message, 'SANDBOX_TIMEOUT');
  error.suggestion = ERROR_SUGGESTIONS.SANDBOX_TIMEOUT;
  return error;
}

/**
 * Create a sandbox execution error.
 */
export function sandboxExecutionError(message: string, cause?: Error): RLMError {
  const fullMessage = `Sandbox execution failed: ${message}`;
  const error = new RLMError(fullMessage, 'SANDBOX_ERROR', cause);
  error.suggestion = ERROR_SUGGESTIONS.SANDBOX_ERROR;
  return error;
}

/**
 * Create an LLM API error.
 */
export function llmError(message: string, cause?: Error): RLMError {
  const fullMessage = `LLM API error: ${message}`;
  const error = new RLMError(fullMessage, 'LLM_ERROR', cause);
  error.suggestion = classifyLLMError(message);
  return error;
}

/**
 * Classify an LLM error and provide specific suggestions.
 */
function classifyLLMError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'You are being rate limited. Wait a moment before retrying, or use the ResilientClient with retry options.';
  }

  if (
    lower.includes('unauthorized') ||
    lower.includes('invalid api key') ||
    lower.includes('401')
  ) {
    return 'Your API key is invalid or missing. Check that OPENAI_API_KEY or ANTHROPIC_API_KEY is set correctly.';
  }

  if (lower.includes('insufficient') || lower.includes('quota') || lower.includes('billing')) {
    return "Your API account may have insufficient credits. Check your billing status at the provider's dashboard.";
  }

  if (
    lower.includes('context length') ||
    lower.includes('token limit') ||
    lower.includes('too long')
  ) {
    return 'The input is too long. RLM should handle this, but try reducing context size or using a model with larger context window.';
  }

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'The API request timed out. Try again or check your network connection.';
  }

  if (
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('server error')
  ) {
    return 'The API server is experiencing issues. This is temporary - please try again in a few moments.';
  }

  if (lower.includes('network') || lower.includes('connection') || lower.includes('enotfound')) {
    return 'Network error - check your internet connection and firewall settings.';
  }

  return ERROR_SUGGESTIONS.LLM_ERROR;
}

/**
 * Create a max iterations error.
 */
export function maxIterationsError(iterations: number): RLMError {
  const message = `Maximum iterations (${iterations}) reached without producing a final answer`;
  const error = new RLMError(message, 'MAX_ITERATIONS');
  error.suggestion =
    `The LLM ran for ${iterations} iterations without finding an answer. ` +
    'Try: (1) rephrasing your query to be more specific, ' +
    '(2) increasing maxIterations if the task genuinely requires more steps, ' +
    '(3) providing clearer context, or ' +
    '(4) checking if the context actually contains the information needed.';
  return error;
}

/**
 * Create a max depth error.
 */
export function maxDepthError(depth: number): RLMError {
  const message = `Maximum recursion depth (${depth}) exceeded`;
  const error = new RLMError(message, 'MAX_DEPTH');
  error.suggestion =
    `Your query triggered too many nested llm_query() calls (max depth: ${depth}). ` +
    'Try: (1) simplifying your query to require fewer sub-queries, ' +
    '(2) increasing maxDepth if deep recursion is necessary, or ' +
    '(3) restructuring the task to use llm_query_parallel() instead of nested calls.';
  return error;
}

/**
 * Create a parse error.
 */
export function parseError(message: string): RLMError {
  const fullMessage = `Failed to parse LLM output: ${message}`;
  const error = new RLMError(fullMessage, 'PARSE_ERROR');
  error.suggestion =
    'The LLM produced output that could not be parsed. ' +
    'This usually resolves on retry. If it persists, try using a different model.';
  return error;
}

/**
 * Create an invalid configuration error.
 */
export function invalidConfigError(message: string): RLMError {
  const fullMessage = `Invalid configuration: ${message}`;
  const error = new RLMError(fullMessage, 'INVALID_CONFIG');
  error.suggestion =
    'Review your RLM configuration options. Common issues: ' +
    'missing API key, invalid model name, negative numeric values, or temperature outside 0-2 range.';
  return error;
}

/**
 * Create a metrics store error.
 */
export function metricsStoreError(message: string, cause?: Error): RLMError {
  const fullMessage = `Metrics store error: ${message}`;
  const error = new RLMError(fullMessage, 'METRICS_STORE_ERROR', cause);
  error.suggestion = ERROR_SUGGESTIONS.METRICS_STORE_ERROR;
  return error;
}

/**
 * Check if an error is an RLMError.
 */
export function isRLMError(error: unknown): error is RLMError {
  return error instanceof RLMError;
}

/**
 * Check if an error is of a specific type.
 */
export function isRLMErrorCode(error: unknown, code: RLMErrorCode): boolean {
  return isRLMError(error) && error.code === code;
}

/**
 * Wrap an unknown error as an RLMError.
 */
export function wrapError(error: unknown, defaultCode: RLMErrorCode = 'LLM_ERROR'): RLMError {
  if (isRLMError(error)) {
    return error;
  }

  if (error instanceof Error) {
    const wrapped = new RLMError(error.message, defaultCode, error);
    wrapped.suggestion = ERROR_SUGGESTIONS[defaultCode];
    return wrapped;
  }

  const wrapped = new RLMError(String(error), defaultCode);
  wrapped.suggestion = ERROR_SUGGESTIONS[defaultCode];
  return wrapped;
}

/**
 * Format an error for display to the user.
 */
export function formatError(error: unknown): string {
  if (isRLMError(error)) {
    const lines = [`Error [${error.code}]: ${error.message}`];

    if (error.suggestion) {
      lines.push('');
      lines.push(`Suggestion: ${error.suggestion}`);
    }

    if (error.cause) {
      lines.push('');
      lines.push(`Caused by: ${error.cause.message}`);
    }

    return lines.join('\n');
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/**
 * Create a helpful error message when API key is missing.
 */
export function missingApiKeyError(provider: 'openai' | 'anthropic'): RLMError {
  const envVar = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
  const url =
    provider === 'openai'
      ? 'https://platform.openai.com/api-keys'
      : 'https://console.anthropic.com/';

  const message = `Missing ${provider} API key`;
  const error = new RLMError(message, 'INVALID_CONFIG');
  error.suggestion =
    `Set the ${envVar} environment variable with your API key. ` +
    `You can get an API key from ${url}`;
  return error;
}

/**
 * Create an error for unsupported model.
 */
export function unsupportedModelError(model: string): RLMError {
  const message = `Unsupported model: ${model}`;
  const error = new RLMError(message, 'INVALID_CONFIG');
  error.suggestion =
    'Supported models include: ' +
    'gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo (OpenAI), ' +
    'claude-3-5-sonnet-latest, claude-3-5-haiku-latest, claude-3-opus-latest (Anthropic). ' +
    'Check for typos in the model name.';
  return error;
}
