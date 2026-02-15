/**
 * RLM Metrics API
 * Express router for metrics endpoints
 */

import { Router, Request, Response, NextFunction } from 'express';
import { metricsCollector } from './collector.js';

const router = Router();

// Authentication middleware
function authenticate(req: Request, res: Response, next: NextFunction): void {
  if (!metricsCollector.isEnabled()) {
    res.status(503).json({ error: 'Metrics not enabled' });
    return;
  }

  const apiKey = metricsCollector.getApiKey();
  if (!apiKey) {
    // No API key configured, allow all requests
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.substring(7);
  if (token !== apiKey) {
    res.status(403).json({ error: 'Invalid API key' });
    return;
  }

  next();
}

// Apply authentication to all routes
router.use(authenticate);

/**
 * GET /api/metrics/health
 * Returns health status of the RLM instance
 */
router.get('/health', (_req: Request, res: Response) => {
  const health = metricsCollector.getHealth();
  res.json(health);
});

/**
 * GET /api/metrics/stats
 * Returns aggregated statistics
 * Query params:
 *   - period: hour | day | week | month (default: day)
 */
router.get('/stats', (req: Request, res: Response) => {
  const period = (req.query.period as 'hour' | 'day' | 'week' | 'month') || 'day';
  const stats = metricsCollector.getStats(period);
  res.json(stats);
});

/**
 * GET /api/metrics/queries
 * Returns query history
 * Query params:
 *   - limit: number (default: 100)
 *   - offset: number (default: 0)
 *   - since: ISO date string
 *   - model: filter by model name
 *   - success: true | false
 */
router.get('/queries', (req: Request, res: Response) => {
  const options = {
    limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
    offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    since: req.query.since ? new Date(String(req.query.since)) : undefined,
    model: req.query.model ? String(req.query.model) : undefined,
    success: req.query.success !== undefined ? req.query.success === 'true' : undefined,
  };

  const result = metricsCollector.getQueries(options);
  res.json(result);
});

/**
 * GET /api/metrics/queries/:id
 * Returns a single query by ID
 */
router.get('/queries/:id', (req: Request, res: Response) => {
  const query = metricsCollector.getQuery(String(req.params.id));
  if (!query) {
    res.status(404).json({ error: 'Query not found' });
    return;
  }
  res.json(query);
});

/**
 * GET /api/metrics/content
 * Returns content source information
 * Note: This would need to be populated by the RLM instance
 */
router.get('/content', (_req: Request, res: Response) => {
  // Placeholder - would need integration with RLM context loading
  res.json({
    sources: [],
    totalBytes: 0,
    healthScore: 100,
    message: 'Content metrics not yet implemented',
  });
});

export { router as metricsRouter };
