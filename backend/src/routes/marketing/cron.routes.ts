import { Router, type Request, type Response } from 'express';
import { getRuntimeEnvironment } from '../../config/runtime-environment.js';
import { cronGuard } from '../../middleware/auth/auth.middleware.js';
import { runPushDripCampaign } from '../../services/marketing/lifecycle/push-drip.service.js';
import { runSignupDripCampaign } from '../../services/marketing/lifecycle/signup-drip.service.js';
import { runSignupNotionDashboardSync } from '../../services/marketing/lifecycle/signup-notion-dashboard.service.js';
import {
  runMonthlyMarketingEmailInsightsReport,
  runWeeklyMarketingEmailInsightsReport,
} from '../../services/reporting/email/marketing-email-insights-report.service.js';
import {
  generateFinancialInsightsReport,
  sendFinancialInsightsSlackReport,
  runMonthlyFinancialInsightsReport,
  runWeeklyFinancialInsightsReport,
  parseIsoDate,
  parseOptionalBoolean,
  parseReportType,
  validateDateRange,
} from '../../services/reporting/finance/financial-insights-report.service.js';
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

router.post('/cron/financial-insights-weekly', cronGuard, async (_req: Request, res: Response) => {
  try {
    const result = await runWeeklyFinancialInsightsReport({
      environment: getRuntimeEnvironment(),
    });

    res.json({
      success: true,
      message: 'Weekly financial insights report completed',
      result,
    });
  } catch (error) {
    logger.error('CRON weekly financial insights failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ success: false, error: 'Weekly financial insights report failed' });
  }
});

router.post('/cron/financial-insights-monthly', cronGuard, async (_req: Request, res: Response) => {
  try {
    const result = await runMonthlyFinancialInsightsReport({
      environment: getRuntimeEnvironment(),
    });

    res.json({
      success: true,
      message: 'Monthly financial insights report completed',
      result,
    });
  } catch (error) {
    logger.error('CRON monthly financial insights failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ success: false, error: 'Monthly financial insights report failed' });
  }
});

router.post('/cron/financial-insights-ad-hoc', cronGuard, async (req: Request, res: Response) => {
  const reportType = parseReportType(req.body?.['reportType']);
  const periodStart = parseIsoDate(req.body?.['periodStart']);
  const periodEnd = parseIsoDate(req.body?.['periodEnd']);
  const persist = parseOptionalBoolean(req.body?.['persist'], true);
  const sendSlack = parseOptionalBoolean(req.body?.['sendSlack'], true);

  if (!reportType)
    return void res
      .status(400)
      .json({ success: false, error: 'reportType must be one of: weekly, monthly' });
  if (!periodStart || !periodEnd)
    return void res
      .status(400)
      .json({ success: false, error: 'periodStart and periodEnd are required ISO date strings' });

  const rangeError = validateDateRange(periodStart, periodEnd);
  if (rangeError) return void res.status(400).json({ success: false, error: rangeError });

  try {
    const report = await generateFinancialInsightsReport({
      reportType,
      periodStart,
      periodEnd,
      environment: getRuntimeEnvironment(),
      persist,
    });
    const slackDelivered = sendSlack ? await sendFinancialInsightsSlackReport(report) : false;
    res.json({
      success: true,
      message: 'Ad-hoc financial insights report completed',
      result: { report, slackDelivered },
    });
  } catch (error) {
    logger.error('CRON ad-hoc financial insights failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Ad-hoc financial insights report failed' });
  }
});

router.post('/cron/financial-insights-preview', cronGuard, async (req: Request, res: Response) => {
  const reportType = parseReportType(req.body?.['reportType']);
  const periodStart = parseIsoDate(req.body?.['periodStart']);
  const periodEnd = parseIsoDate(req.body?.['periodEnd']);

  if (!reportType)
    return void res
      .status(400)
      .json({ success: false, error: 'reportType must be one of: weekly, monthly' });
  if (!periodStart || !periodEnd)
    return void res
      .status(400)
      .json({ success: false, error: 'periodStart and periodEnd are required ISO date strings' });

  const rangeError = validateDateRange(periodStart, periodEnd);
  if (rangeError) return void res.status(400).json({ success: false, error: rangeError });

  try {
    const report = await generateFinancialInsightsReport({
      reportType,
      periodStart,
      periodEnd,
      environment: getRuntimeEnvironment(),
      persist: false,
    });
    res.json({
      success: true,
      message: 'Financial insights preview generated',
      result: { report, persisted: false, slackSent: false },
    });
  } catch (error) {
    logger.error('CRON financial insights preview failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Financial insights preview failed' });
  }
});

export default router;
