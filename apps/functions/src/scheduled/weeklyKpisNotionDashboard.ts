/**
 * @fileoverview Scheduled Cloud Function: Weekly KPIs Notion Dashboard Sync
 * @module functions/scheduled/weeklyKpisNotionDashboard
 *
 * Triggers weekly (Monday 8 AM ET) to sync KPI metrics to the Notion dashboard.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { postBackendCronJson } from './utils/backendCronRequest';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

/**
 * Scheduled trigger: Every Sunday at 8:00 AM ET.
 * Computes KPIs for the prior week and pushes to Notion.
 */
export const weeklyKpisNotionDashboard = onSchedule(
  {
    schedule: '0 8 * * 0',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting weekly KPIs Notion dashboard sync');

    try {
      const result = await postBackendCronJson<{ result?: unknown }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/marketing/cron/weekly-kpis-notion-dashboard',
        cronSecret: CRON_SECRET.value(),
        jobName: 'weeklyKpisNotionDashboard',
        timeoutMs: 45_000,
        maxAttempts: 3,
      });

      if (!result) {
        logger.warn('Weekly KPIs Notion dashboard sync skipped due to transient backend outage');
        return;
      }

      logger.info('Weekly KPIs Notion dashboard sync completed', {
        result: result.data,
      });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      logger.error('Weekly KPIs Notion dashboard sync failed', { error: normalized.message });
      throw normalized;
    }
  }
);
