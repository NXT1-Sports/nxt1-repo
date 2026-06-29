/**
 * @fileoverview Monthly Financial Insights — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/monthlyFinancialInsights
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { postBackendCronJson } from './utils/backendCronRequest';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

export const monthlyFinancialInsights = onSchedule(
  {
    schedule: '0 8 1 * *',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting monthly financial insights report run');

    try {
      const result = await postBackendCronJson<{ result?: unknown }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/marketing/cron/financial-insights-monthly',
        cronSecret: CRON_SECRET.value(),
        jobName: 'monthlyFinancialInsights',
        timeoutMs: 45_000,
        maxAttempts: 3,
      });

      if (!result) {
        logger.warn('Monthly financial insights report skipped due to transient backend outage');
        return;
      }

      logger.info('Monthly financial insights report completed', { result: result.data });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      logger.error('Monthly financial insights report failed', { error: normalized.message });
      throw normalized;
    }
  }
);
