import { Router, Request, Response, NextFunction } from 'express';
import { metricsCollector } from './collector.js';

const router = Router();

function authenticate(req: Request, res: Response, next: NextFunction): void {
  if (!metricsCollector.isEnabled()) {
    res.status(503).json({ error: 'Metrics not enabled' });
    return;
  }

  const apiKey = metricsCollector.getApiKey();
  if (!apiKey) {
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

router.use(authenticate);

router.get('/health', async (_req: Request, res: Response) => {
  const health = await metricsCollector.getHealth();
  res.json(health);
});

router.get('/stats', async (req: Request, res: Response) => {
  const period = (req.query.period as 'hour' | 'day' | 'week' | 'month') || 'day';
  const stats = await metricsCollector.getStats(period);
  res.json(stats);
});

router.get('/queries', async (req: Request, res: Response) => {
  const options = {
    limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
    offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    since: req.query.since ? new Date(String(req.query.since)) : undefined,
    model: req.query.model ? String(req.query.model) : undefined,
    success: req.query.success !== undefined ? req.query.success === 'true' : undefined,
  };

  const result = await metricsCollector.getQueries(options);
  res.json(result);
});

router.get('/queries/:id', async (req: Request, res: Response) => {
  const query = await metricsCollector.getQuery(String(req.params.id));
  if (!query) {
    res.status(404).json({ error: 'Query not found' });
    return;
  }
  res.json(query);
});

router.get('/content', (_req: Request, res: Response) => {
  res.json({
    sources: [],
    totalBytes: 0,
    healthScore: 100,
    message: 'Content metrics not yet implemented',
  });
});

export { router as metricsRouter };
