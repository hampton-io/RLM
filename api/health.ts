import type { VercelRequest, VercelResponse } from '@vercel/node';

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
 * GET /api/health
 *
 * Health check endpoint.
 */
export default function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET.',
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

  return res.status(200).json({
    status: 'healthy',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    environment: {
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    },
  });
}
