/**
 * @fileoverview Churned Notion Dashboard Sync — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/churnedNotionDashboard
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { postBackendCronJson } from './utils/backendCronRequest';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

export const churnedNotionDashboard = onSchedule(
  {
    schedule: '0 4 * * *',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting churned Notion dashboard sync');

    try {
      const result = await postBackendCronJson<{ result?: unknown }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/marketing/cron/churned-notion-dashboard',
        cronSecret: CRON_SECRET.value(),
        jobName: 'churnedNotionDashboard',
        timeoutMs: 45_000,
        maxAttempts: 3,
      });

      if (!result) {
        logger.warn('Churned Notion dashboard sync skipped due to transient backend outage');
        return;
      }

      logger.info('Churned Notion dashboard sync completed', { result: result.data });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      logger.error('Churned Notion dashboard sync failed', { error: normalized.message });
      throw normalized;
    }
  }
);
