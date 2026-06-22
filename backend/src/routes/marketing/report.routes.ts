import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '@nxt1/core/errors/express';
import { adminGuard } from '../../middleware/auth/auth.middleware.js';
import { getPushDripReport } from '../../services/marketing/lifecycle/push-drip-report.service.js';
import {
  buildPreviousMonthInsightsWindow,
  buildWeeklyInsightsWindow,
  generateMarketingEmailInsightsReport,
} from '../../services/marketing/reporting/marketing-email-insights-report.service.js';
import { getRuntimeEnvironment } from '../../config/runtime-environment.js';

const router = Router();

function parseLookbackDays(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }

  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return undefined;
  }

  return Math.max(1, Math.min(Math.floor(normalized), 30));
}

router.get(
  '/reports/push-drip',
  adminGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const report = await getPushDripReport({
      db: req.firebase!.db,
      lookbackDays: parseLookbackDays(req.query['lookbackDays']),
    });

    res.json({ success: true, data: report });
  })
);

router.get(
  '/reports/insights/weekly',
  adminGuard,
  asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const window = buildWeeklyInsightsWindow();
    const report = await generateMarketingEmailInsightsReport({
      reportType: 'weekly',
      periodStart: window.periodStart,
      periodEnd: window.periodEnd,
      environment: getRuntimeEnvironment(),
      persist: false,
    });

    res.json({ success: true, data: report });
  })
);

router.get(
  '/reports/insights/monthly',
  adminGuard,
  asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const window = buildPreviousMonthInsightsWindow();
    const report = await generateMarketingEmailInsightsReport({
      reportType: 'monthly',
      periodStart: window.periodStart,
      periodEnd: window.periodEnd,
      environment: getRuntimeEnvironment(),
      persist: false,
    });

    res.json({ success: true, data: report });
  })
);

export default router;
