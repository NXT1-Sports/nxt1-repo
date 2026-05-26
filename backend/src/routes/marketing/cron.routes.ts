import { Router, type Request, type Response } from 'express';
import { getRuntimeEnvironment } from '../../config/runtime-environment.js';
import { cronGuard } from '../../middleware/auth/auth.middleware.js';
import { runPushDripCampaign } from '../../services/marketing/lifecycle/push-drip.service.js';
import { runSignupDripCampaign } from '../../services/marketing/lifecycle/signup-drip.service.js';
import { db } from '../../utils/firebase.js';
import { logger } from '../../utils/logger.js';

const router = Router();

function parseLimit(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  const normalized = Math.floor(value);
  if (normalized <= 0) {
    return undefined;
  }

  return Math.min(normalized, 500);
}

router.post('/cron/signup-drip', cronGuard, async (req: Request, res: Response) => {
  try {
    const result = await runSignupDripCampaign({
      db,
      environment: getRuntimeEnvironment(),
      limit: parseLimit(req.body?.['limit']),
    });

    res.json({
      success: true,
      message: 'Signup drip run completed',
      result,
    });
  } catch (error) {
    logger.error('CRON signup-drip failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ success: false, error: 'Signup drip failed' });
  }
});

router.post('/cron/push-drip', cronGuard, async (req: Request, res: Response) => {
  try {
    const result = await runPushDripCampaign({
      db,
      environment: getRuntimeEnvironment(),
      limit: parseLimit(req.body?.['limit']),
    });

    res.json({
      success: true,
      message: 'Push drip run completed',
      result,
    });
  } catch (error) {
    logger.error('CRON push-drip failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ success: false, error: 'Push drip failed' });
  }
});

export default router;
