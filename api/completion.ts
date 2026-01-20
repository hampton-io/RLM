import type { VercelRequest, VercelResponse } from '@vercel/node';
import { RLM, CompletionRequestSchema, isRLMError } from '../src/index.js';

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
