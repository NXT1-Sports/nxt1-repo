/**
 * @fileoverview Scheduled Cloud Function: Monthly Scoreboard Notion Dashboard Sync
 * @module functions/scheduled/monthlyScoreboardNotionDashboard
 *
 * Triggers monthly (1st day at 8 AM ET) to sync monthly scoreboard metrics to Notion.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { postBackendCronJson } from './utils/backendCronRequest';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

/**
 * Scheduled trigger: 31st day of month at 8:00 AM ET.
 * Computes metrics for the prior month and pushes to Notion.
 */
export const monthlyScoreboardNotionDashboard = onSchedule(
  {
    schedule: '0 8 31 * *',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting monthly scoreboard Notion dashboard sync');

    try {
      const result = await postBackendCronJson<{ result?: unknown }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/marketing/cron/monthly-scoreboard-notion-dashboard',
        cronSecret: CRON_SECRET.value(),
        jobName: 'monthlyScoreboardNotionDashboard',
        timeoutMs: 45_000,
        maxAttempts: 3,
      });

      if (!result) {
        logger.warn(
          'Monthly scoreboard Notion dashboard sync skipped due to transient backend outage'
        );
        return;
      }

      logger.info('Monthly scoreboard Notion dashboard sync completed', {
        result: result.data,
      });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      logger.error('Monthly scoreboard Notion dashboard sync failed', {
        error: normalized.message,
      });
      throw normalized;
    }
  }
);
