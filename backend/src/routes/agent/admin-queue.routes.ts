/**
 * @fileoverview Agent X — Admin queue management routes.
 *
 * POST /pause
 * POST /resume
 * GET  /queue-stats
 */

import { Router, type Request, type Response } from 'express';
import { adminGuard } from '../../middleware/auth/auth.middleware.js';
import { logger } from '../../utils/logger.js';
import { queueService } from './shared.js';

const router = Router();

// ─── POST /pause ──────────────────────────────────────────────────────────

router.post('/pause', adminGuard, async (_req: Request, res: Response) => {
  try {
    if (!queueService) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    await queueService.pauseAll();
    logger.info('Agent queue paused by admin');
    res.json({ success: true, data: { paused: true } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to pause queue', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to pause queue' });
  }
});

// ─── POST /resume ─────────────────────────────────────────────────────────

router.post('/resume', adminGuard, async (_req: Request, res: Response) => {
  try {
    if (!queueService) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    await queueService.resumeAll();
    logger.info('Agent queue resumed by admin');
    res.json({ success: true, data: { paused: false } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to resume queue', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to resume queue' });
  }
});

// ─── GET /queue-stats ─────────────────────────────────────────────────────

router.get('/queue-stats', adminGuard, async (_req: Request, res: Response) => {
  try {
    if (!queueService) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    const counts = await queueService.getCounts();
    const paused = await queueService.isPaused();
    res.json({ success: true, data: { counts, paused } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to get queue stats', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

export default router;
