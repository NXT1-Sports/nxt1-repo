/**
 * @fileoverview Monthly Insights — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/monthlyInsights
 *
 * Runs on day 1 of every month at 8:00 AM America/New_York and calls the
 * backend cron endpoint that builds and posts the monthly insights report.
 *
 * Required secrets (Firebase Secret Manager):
 *   - CRON_SECRET: Shared secret between this function and the backend
 *
 * Required params (Firebase App Hosting / .env):
 *   - BACKEND_URL: Base URL of the backend API (e.g. https://api.nxt1sports.com)
 *
 * Backend env requirements:
 *   - SLACK_INSIGHTS_WEBHOOK_URL: Slack destination for insights reports
 *   - STAGING_SLACK_INSIGHTS_WEBHOOK_URL: Optional staging-specific override
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { postBackendCronJson } from './utils/backendCronRequest';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

/**
 * Monthly Insights — day 1 of every month at 8:00 AM America/New_York.
 */
export const monthlyInsights = onSchedule(
  {
    schedule: '0 8 1 * *',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting monthly insights report run');

    try {
      const result = await postBackendCronJson<{ result?: unknown }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/marketing/cron/insights-monthly',
        cronSecret: CRON_SECRET.value(),
        jobName: 'monthlyInsights',
        timeoutMs: 45_000,
        maxAttempts: 3,
      });

      if (!result) {
        logger.warn('Monthly insights report skipped due to transient backend outage');
        return;
      }

      logger.info('Monthly insights report completed', { result: result.data });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      logger.error('Monthly insights report failed', { error: normalized.message });
      throw normalized;
    }
  }
);
