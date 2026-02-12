import type { VercelRequest, VercelResponse } from '@vercel/node';
import { RLM, CompletionRequestSchema, isRLMError } from '../src/index.js';

const API_KEY_ENV = 'RLM_API_KEY';
const MAX_BODY_BYTES = 1_000_000; // 1MB
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;

const rateLimitBuckets = new Map<string, { count: number; windowStart: number }>();

function getClientId(req: VercelRequest): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (Array.isArray(forwardedFor)) {
    return forwardedFor[0] ?? 'unknown';
  }
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function getApiKey(req: VercelRequest): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }
  const apiKeyHeader = req.headers['x-api-key'];
  if (Array.isArray(apiKeyHeader)) {
    return apiKeyHeader[0] ?? null;
  }
  if (typeof apiKeyHeader === 'string') {
    return apiKeyHeader;
  }
  return null;
}

function isRateLimited(clientId: string): { limited: boolean; retryAfterMs: number } {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(clientId);
  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(clientId, { count: 1, windowStart: now });
    return { limited: false, retryAfterMs: RATE_LIMIT_WINDOW_MS };
  }

  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - bucket.windowStart);
    return { limited: true, retryAfterMs };
  }

  bucket.count += 1;
  return { limited: false, retryAfterMs: RATE_LIMIT_WINDOW_MS };
}

/**
 * POST /api/completion
 *
 * Execute an RLM completion request.
 *
 * Request body:
 * {
 *   "query": "Your question or task",
 *   "context": "Optional large context string",
 *   "options": {
 *     "model": "gpt-4o-mini",
 *     "maxIterations": 20,
 *     "maxDepth": 1,
 *     "temperature": 0
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "response": "The answer",
 *   "trace": [...],
 *   "usage": { "totalTokens": 1234, "totalCalls": 5, "estimatedCost": 0.001 }
 * }
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.',
    });
  }

  const requiredApiKey = process.env[API_KEY_ENV];
  if (!requiredApiKey) {
    return res.status(500).json({
      success: false,
      error: 'API key not configured on server.',
    });
  }

  const providedApiKey = getApiKey(req);
  if (!providedApiKey || providedApiKey !== requiredApiKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized. Invalid API key.',
    });
  }

  const contentLength = Number(req.headers['content-length'] ?? 0);
  if (contentLength && contentLength > MAX_BODY_BYTES) {
    return res.status(413).json({
      success: false,
      error: 'Request payload too large.',
    });
  }

  const estimatedBodySize = Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8');
  if (estimatedBodySize > MAX_BODY_BYTES) {
    return res.status(413).json({
      success: false,
      error: 'Request payload too large.',
    });
  }

  const clientId = getClientId(req);
  const rateLimit = isRateLimited(clientId);
  if (rateLimit.limited) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({
      success: false,
      error: 'Rate limit exceeded. Try again later.',
    });
  }

  try {
    // Validate request body
    const parseResult = CompletionRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: parseResult.error.issues,
      });
    }

    const { query, context, options } = parseResult.data;

    // Create RLM instance
    const rlm = new RLM({
      model: (options?.model as Parameters<typeof RLM['prototype']['constructor']>[0]['model']) ?? 'gpt-4o-mini',
      maxIterations: options?.maxIterations ?? 20,
      maxDepth: options?.maxDepth ?? 1,
      temperature: options?.temperature ?? 0,
      verbose: false,
    });

    // Execute completion
    const result = await rlm.completion(query, context);

    return res.status(200).json({
      success: true,
      response: result.response,
      trace: result.trace,
      usage: result.usage,
      executionTime: result.executionTime,
    });
  } catch (error) {
    console.error('RLM completion error:', error);

    if (isRLMError(error)) {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({
      success: false,
      error: message,
    });
  }
}
