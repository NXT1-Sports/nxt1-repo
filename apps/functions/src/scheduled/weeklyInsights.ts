/**
 * @fileoverview Weekly Insights — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/weeklyInsights
 *
 * Runs every Friday at 8:00 AM America/New_York and calls the backend cron
 * endpoint that builds and posts the weekly insights report.
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
 * Weekly Insights — every Friday at 8:00 AM America/New_York.
 */
export const weeklyInsights = onSchedule(
  {
    schedule: '0 8 * * 5',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting weekly insights report run');

    try {
      const result = await postBackendCronJson<{ result?: unknown }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/marketing/cron/insights-weekly',
        cronSecret: CRON_SECRET.value(),
        jobName: 'weeklyInsights',
        timeoutMs: 45_000,
        maxAttempts: 3,
      });

      if (!result) {
        logger.warn('Weekly insights report skipped due to transient backend outage');
        return;
      }

      logger.info('Weekly insights report completed', { result: result.data });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      logger.error('Weekly insights report failed', { error: normalized.message });
      throw normalized;
    }
  }
);
