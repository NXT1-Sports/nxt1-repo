/**
 * @fileoverview Weekly Financial Insights — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/weeklyFinancialInsights
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';

const CRON_SECRET = defineSecret('CRON_SECRET');

export const weeklyFinancialInsights = onSchedule(
  {
    schedule: '0 8 * * 5',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Weekly financial insights job disabled');
  }
);
