import { Router, type Request, type Response } from 'express';
import { getRuntimeEnvironment } from '../../config/runtime-environment.js';
import { cronGuard } from '../../middleware/auth/auth.middleware.js';
import { runB2BMemberCountNotionDashboardSync } from '../../services/marketing/lifecycle/b2b-member-count-notion-dashboard.service.js';
import {
  runB2BOutboundFollowUpSend,
  runB2BOutboundInitialSend,
} from '../../services/marketing/lifecycle/b2b-outbound-automation.service.js';
import {
  runInvestorsPartnershipsOutboundFollowUpSend,
  runInvestorsPartnershipsOutboundInitialSend,
} from '../../services/marketing/lifecycle/investors-partnerships-outbound-automation.service.js';
import {
  runB2CChurnedNotionDashboardSync,
  runB2CClosedLostNotionDashboardSync,
} from '../../services/marketing/lifecycle/b2c-billing-notion-dashboard.service.js';
import { runClosedLostNotionDashboardSync } from '../../services/marketing/lifecycle/closed-lost-notion-dashboard.service.js';
import { runChurnedNotionDashboardSync } from '../../services/marketing/lifecycle/churned-notion-dashboard.service.js';
import { runPushDripCampaign } from '../../services/marketing/lifecycle/push-drip.service.js';
import { runSignupDripCampaign } from '../../services/marketing/lifecycle/signup-drip.service.js';
import { runSignupNotionDashboardSync } from '../../services/marketing/lifecycle/signup-notion-dashboard.service.js';
import { processPendingMarketingOutboxEvents } from '../../services/marketing/outbox/marketing-outbox.service.js';
import {
  runMonthlyMarketingEmailInsightsReport,
  runWeeklyMarketingEmailInsightsReport,
} from '../../services/reporting/email/marketing-email-insights-report.service.js';
import {
  generateMonthlyScoreboardReport,
  getPreviousMonthStart,
} from '../../services/reporting/monthly-scoreboard-report.service.js';
import {
  generateWeeklyKpisReport,
  getPreviousWeekStart,
} from '../../services/reporting/weekly-kpis-report.service.js';
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

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
  res.status(410).json({
    success: false,
    error: 'Financial insights reports are temporarily disabled',
  });
});

router.post('/cron/financial-insights-monthly', cronGuard, async (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error: 'Financial insights reports are temporarily disabled',
  });
});

router.post('/cron/financial-insights-ad-hoc', cronGuard, async (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error: 'Financial insights reports are temporarily disabled',
  });
});

router.post('/cron/financial-insights-preview', cronGuard, async (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error: 'Financial insights reports are temporarily disabled',
  });
});

router.post('/cron/churned-notion-dashboard', cronGuard, async (req: Request, res: Response) => {
  try {
    if (!req.firebase?.db) {
      res.status(500).json({ success: false, error: 'Firebase context unavailable' });
      return;
    }

    const result = await runChurnedNotionDashboardSync({
      db: req.firebase.db,
      limit: parseLimit(req.body?.['limit']),
      graceDays:
        typeof req.body?.['graceDays'] === 'number' && Number.isFinite(req.body?.['graceDays'])
          ? Math.max(1, Math.min(Math.floor(req.body['graceDays']), 365))
          : undefined,
    });

    res.json({
      success: true,
      message: 'Churned Notion dashboard sync completed',
      result,
    });
  } catch (error) {
    logger.error('CRON churned-notion-dashboard failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ success: false, error: 'Churned Notion dashboard sync failed' });
  }
});

router.post(
  '/cron/b2c-churned-notion-dashboard',
  cronGuard,
  async (req: Request, res: Response) => {
    try {
      if (!req.firebase?.db) {
        res.status(500).json({ success: false, error: 'Firebase context unavailable' });
        return;
      }

      const result = await runB2CChurnedNotionDashboardSync({
        db: req.firebase.db,
        environment: req.isStaging ? 'staging' : 'production',
        limit: parseLimit(req.body?.['limit']),
        graceDays:
          typeof req.body?.['graceDays'] === 'number' && Number.isFinite(req.body?.['graceDays'])
            ? Math.max(1, Math.min(Math.floor(req.body['graceDays']), 365))
            : undefined,
      });

      res.json({
        success: true,
        message: 'B2C Churned Notion dashboard sync completed',
        result,
      });
    } catch (error) {
      logger.error('CRON b2c-churned-notion-dashboard failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ success: false, error: 'B2C Churned Notion dashboard sync failed' });
    }
  }
);

router.post(
  '/cron/b2c-closed-lost-notion-dashboard',
  cronGuard,
  async (req: Request, res: Response) => {
    try {
      if (!req.firebase?.db) {
        res.status(500).json({ success: false, error: 'Firebase context unavailable' });
        return;
      }

      const result = await runB2CClosedLostNotionDashboardSync({
        db: req.firebase.db,
        environment: req.isStaging ? 'staging' : 'production',
        limit: parseLimit(req.body?.['limit']),
        decisionWindowDays:
          typeof req.body?.['decisionWindowDays'] === 'number' &&
          Number.isFinite(req.body?.['decisionWindowDays'])
            ? Math.max(1, Math.min(Math.floor(req.body['decisionWindowDays']), 365))
            : undefined,
        inactivityDays:
          typeof req.body?.['inactivityDays'] === 'number' &&
          Number.isFinite(req.body?.['inactivityDays'])
            ? Math.max(1, Math.min(Math.floor(req.body['inactivityDays']), 365))
            : undefined,
      });

      res.json({
        success: true,
        message: 'B2C Closed Lost Notion dashboard sync completed',
        result,
      });
    } catch (error) {
      logger.error('CRON b2c-closed-lost-notion-dashboard failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res
        .status(500)
        .json({ success: false, error: 'B2C Closed Lost Notion dashboard sync failed' });
    }
  }
);

router.post(
  '/cron/closed-lost-notion-dashboard',
  cronGuard,
  async (req: Request, res: Response) => {
    try {
      if (!req.firebase?.db) {
        res.status(500).json({ success: false, error: 'Firebase context unavailable' });
        return;
      }

      const result = await runClosedLostNotionDashboardSync({
        db: req.firebase.db,
        limit: parseLimit(req.body?.['limit']),
        decisionWindowDays:
          typeof req.body?.['decisionWindowDays'] === 'number' &&
          Number.isFinite(req.body?.['decisionWindowDays'])
            ? Math.max(1, Math.min(Math.floor(req.body['decisionWindowDays']), 365))
            : undefined,
        inactivityDays:
          typeof req.body?.['inactivityDays'] === 'number' &&
          Number.isFinite(req.body?.['inactivityDays'])
            ? Math.max(1, Math.min(Math.floor(req.body['inactivityDays']), 365))
            : undefined,
      });

      res.json({
        success: true,
        message: 'Closed Lost Notion dashboard sync completed',
        result,
      });
    } catch (error) {
      logger.error('CRON closed-lost-notion-dashboard failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ success: false, error: 'Closed Lost Notion dashboard sync failed' });
    }
  }
);

router.post(
  '/cron/b2b-member-count-notion-dashboard',
  cronGuard,
  async (req: Request, res: Response) => {
    try {
      if (!req.firebase?.db) {
        res.status(500).json({ success: false, error: 'Firebase context unavailable' });
        return;
      }

      const result = await runB2BMemberCountNotionDashboardSync({
        db: req.firebase.db,
        limit: parseLimit(req.body?.['limit']),
      });

      res.json({
        success: true,
        message: 'B2B member count Notion dashboard sync completed',
        result,
      });
    } catch (error) {
      logger.error('CRON b2b-member-count-notion-dashboard failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res
        .status(500)
        .json({ success: false, error: 'B2B member count Notion dashboard sync failed' });
    }
  }
);

router.post('/cron/b2b-outbound-initial-send', cronGuard, async (req: Request, res: Response) => {
  try {
    if (!req.firebase?.db) {
      res.status(500).json({ success: false, error: 'Firebase context unavailable' });
      return;
    }

    const result = await runB2BOutboundInitialSend({
      db: req.firebase.db,
      environment: getRuntimeEnvironment(),
      limit: parseLimit(req.body?.['limit']),
      dailyCap: parseLimit(req.body?.['dailyCap']),
    });

    res.json({
      success: true,
      message: 'B2B outbound initial send completed',
      result,
    });
  } catch (error) {
    logger.error('CRON b2b-outbound-initial-send failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ success: false, error: 'B2B outbound initial send failed' });
  }
});

router.post('/cron/b2b-outbound-follow-up', cronGuard, async (req: Request, res: Response) => {
  try {
    if (!req.firebase?.db) {
      res.status(500).json({ success: false, error: 'Firebase context unavailable' });
      return;
    }

    const result = await runB2BOutboundFollowUpSend({
      db: req.firebase.db,
      environment: getRuntimeEnvironment(),
      limit: parseLimit(req.body?.['limit']),
      dailyCap: parseLimit(req.body?.['dailyCap']),
    });

    res.json({
      success: true,
      message: 'B2B outbound follow-up send completed',
      result,
    });
  } catch (error) {
    logger.error('CRON b2b-outbound-follow-up failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ success: false, error: 'B2B outbound follow-up failed' });
  }
});

router.post(
  '/cron/investors-partnerships-outbound-initial-send',
  cronGuard,
  async (req: Request, res: Response) => {
    try {
      if (!req.firebase?.db) {
        res.status(500).json({ success: false, error: 'Firebase context unavailable' });
        return;
      }

      const result = await runInvestorsPartnershipsOutboundInitialSend({
        db: req.firebase.db,
        // Always target production Notion routing for Investors & Partnerships outbound.
        environment: 'production',
        limit: parseLimit(req.body?.['limit']),
        dailyCap: parseLimit(req.body?.['dailyCap']),
      });

      res.json({
        success: true,
        message: 'Investors & Partnerships outbound initial send completed',
        result,
      });
    } catch (error) {
      logger.error('CRON investors-partnerships-outbound-initial-send failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res
        .status(500)
        .json({ success: false, error: 'Investors & Partnerships outbound initial send failed' });
    }
  }
);

router.post(
  '/cron/investors-partnerships-outbound-follow-up',
  cronGuard,
  async (req: Request, res: Response) => {
    try {
      if (!req.firebase?.db) {
        res.status(500).json({ success: false, error: 'Firebase context unavailable' });
        return;
      }

      const result = await runInvestorsPartnershipsOutboundFollowUpSend({
        db: req.firebase.db,
        // Always target production Notion routing for Investors & Partnerships outbound.
        environment: 'production',
        limit: parseLimit(req.body?.['limit']),
        dailyCap: parseLimit(req.body?.['dailyCap']),
      });

      res.json({
        success: true,
        message: 'Investors & Partnerships outbound follow-up send completed',
        result,
      });
    } catch (error) {
      logger.error('CRON investors-partnerships-outbound-follow-up failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res
        .status(500)
        .json({ success: false, error: 'Investors & Partnerships outbound follow-up failed' });
    }
  }
);

router.post(
  '/cron/monthly-scoreboard-notion-dashboard',
  cronGuard,
  async (req: Request, res: Response) => {
    try {
      if (!req.firebase?.db) {
        res.status(500).json({ success: false, error: 'Firebase context unavailable' });
        return;
      }

      let monthStart: Date;
      if (typeof req.body?.['monthStart'] === 'string' && req.body.monthStart.trim().length > 0) {
        const parsed = parseIsoDate(req.body.monthStart);
        if (!parsed) {
          res.status(400).json({ success: false, error: 'Invalid monthStart ISO date format' });
          return;
        }
        monthStart = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
      } else {
        monthStart = getPreviousMonthStart();
      }

      const result = await generateMonthlyScoreboardReport({
        db: req.firebase.db,
        monthStart,
        environment: getRuntimeEnvironment(),
        notionEnvironment: req.isStaging ? 'staging' : 'production',
        pushToNotion: true,
      });

      res.json({
        success: true,
        message: 'Monthly Scoreboard report generated and pushed to Notion',
        result,
      });
    } catch (error) {
      logger.error('CRON monthly-scoreboard-notion-dashboard failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ success: false, error: 'Monthly Scoreboard report failed' });
    }
  }
);

router.post(
  '/cron/weekly-kpis-notion-dashboard',
  cronGuard,
  async (req: Request, res: Response) => {
    try {
      if (!req.firebase?.db) {
        res.status(500).json({ success: false, error: 'Firebase context unavailable' });
        return;
      }

      // Parse optional weekStart override (ISO date string) or use previous week
      let weekStart: Date;
      if (typeof req.body?.['weekStart'] === 'string' && req.body.weekStart.trim().length > 0) {
        const parsed = parseIsoDate(req.body.weekStart);
        if (!parsed) {
          res.status(400).json({ success: false, error: 'Invalid weekStart ISO date format' });
          return;
        }
        weekStart = parsed;
      } else {
        weekStart = getPreviousWeekStart();
      }

      const result = await generateWeeklyKpisReport({
        db: req.firebase.db,
        weekStart,
        environment: getRuntimeEnvironment(),
        notionEnvironment: req.isStaging ? 'staging' : 'production',
        pushToNotion: true,
      });

      res.json({
        success: true,
        message: 'Weekly KPIs report generated and pushed to Notion',
        result,
      });
    } catch (error) {
      logger.error('CRON weekly-kpis-notion-dashboard failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ success: false, error: 'Weekly KPIs report failed' });
    }
  }
);

router.post('/cron/marketing-outbox', cronGuard, async (req: Request, res: Response) => {
  try {
    if (!req.firebase?.db) {
      res.status(500).json({ success: false, error: 'Firebase context unavailable' });
      return;
    }

    const result = await processPendingMarketingOutboxEvents({
      db: req.firebase.db,
      limit: parseLimit(req.body?.['limit']),
    });

    res.json({
      success: true,
      message: 'Marketing outbox processed',
      result,
    });
  } catch (error) {
    logger.error('CRON marketing-outbox failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ success: false, error: 'Marketing outbox processing failed' });
  }
});

export default router;
