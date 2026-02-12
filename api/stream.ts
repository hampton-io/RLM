import type { VercelRequest, VercelResponse } from '@vercel/node';
import { RLM, CompletionRequestSchema, isRLMError } from '../src/index.js';

const API_KEY_ENV = 'RLM_API_KEY';

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

/**
 * POST /api/stream
 *
 * Execute an RLM completion with streaming events via Server-Sent Events (SSE).
 *
 * Request body:
 * {
 *   "query": "Your question or task",
 *   "context": "Optional large context string",
 *   "options": {
 *     "model": "gpt-4o-mini",
 *     "maxIterations": 20,
 *     "temperature": 0
 *   }
 * }
 *
 * Response: Server-Sent Events stream with events:
 * - start: { query, contextLength }
 * - thinking: { content, iteration }
 * - code: { code, iteration }
 * - code_output: { output, error?, iteration }
 * - final: { response, method }
 * - error: { message, code? }
 * - done: { usage, executionTime }
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

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Helper to send SSE events
  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Validate request body
    const parseResult = CompletionRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      sendEvent('error', {
        type: 'error',
        message: 'Invalid request body',
        details: parseResult.error.issues,
      });
      res.end();
      return;
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

    // Stream events
    const stream = rlm.stream(query, context);

    for await (const event of stream) {
      sendEvent(event.type, event.data);
    }

    // End the stream
    res.end();
  } catch (error) {
    console.error('RLM streaming error:', error);

    if (isRLMError(error)) {
      sendEvent('error', {
        type: 'error',
        message: error.message,
        code: error.code,
      });
    } else {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendEvent('error', {
        type: 'error',
        message,
      });
    }

    res.end();
  }
}

/**
 * Configuration for Vercel
 */
export const config = {
  maxDuration: 60, // Maximum execution time in seconds
};
