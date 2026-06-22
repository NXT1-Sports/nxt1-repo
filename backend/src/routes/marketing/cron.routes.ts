import { Router, type Request, type Response } from 'express';
import { getRuntimeEnvironment } from '../../config/runtime-environment.js';
import { cronGuard } from '../../middleware/auth/auth.middleware.js';
import { runPushDripCampaign } from '../../services/marketing/lifecycle/push-drip.service.js';
import { runSignupDripCampaign } from '../../services/marketing/lifecycle/signup-drip.service.js';
import { runSignupNotionDashboardSync } from '../../services/marketing/lifecycle/signup-notion-dashboard.service.js';
import {
  runMonthlyMarketingEmailInsightsReport,
  runWeeklyMarketingEmailInsightsReport,
} from '../../services/marketing/reporting/marketing-email-insights-report.service.js';
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

router.post('/cron/signup-notion-dashboard', cronGuard, async (req: Request, res: Response) => {
  try {
    if (!req.firebase?.db) {
      res.status(500).json({ success: false, error: 'Firebase context unavailable' });
      return;
    }

    const result = await runSignupNotionDashboardSync({
      db: req.firebase.db,
      environment: req.isStaging ? 'staging' : 'production',
      limit: parseLimit(req.body?.['limit']),
    });

    res.json({
      success: true,
      message: 'Signup Notion dashboard sync completed',
      result,
    });
  } catch (error) {
    logger.error('CRON signup-notion-dashboard failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ success: false, error: 'Signup Notion dashboard sync failed' });
  }
});

router.post('/cron/insights-weekly', cronGuard, async (_req: Request, res: Response) => {
  try {
    const result = await runWeeklyMarketingEmailInsightsReport({
      environment: getRuntimeEnvironment(),
    });

    res.json({
      success: true,
      message: 'Weekly insights report completed',
      result,
    });
  } catch (error) {
    logger.error('CRON weekly insights failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ success: false, error: 'Weekly insights report failed' });
  }
});

router.post('/cron/insights-monthly', cronGuard, async (_req: Request, res: Response) => {
  try {
    const result = await runMonthlyMarketingEmailInsightsReport({
      environment: getRuntimeEnvironment(),
    });

    res.json({
      success: true,
      message: 'Monthly insights report completed',
      result,
    });
  } catch (error) {
    logger.error('CRON monthly insights failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ success: false, error: 'Monthly insights report failed' });
  }
});

export default router;
