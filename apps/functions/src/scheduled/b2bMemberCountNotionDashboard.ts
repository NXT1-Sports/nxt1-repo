/**
 * @fileoverview B2B Member Count Notion Dashboard Sync — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/b2bMemberCountNotionDashboard
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { postBackendCronJson } from './utils/backendCronRequest';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

export const b2bMemberCountNotionDashboard = onSchedule(
  {
    schedule: '0 4 * * *',
    timeZone: 'America/New_York',
    retryCount: 3,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting B2B member count Notion dashboard sync');

    try {
      const result = await postBackendCronJson<{ result?: unknown }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/marketing/cron/b2b-member-count-notion-dashboard',
        cronSecret: CRON_SECRET.value(),
        jobName: 'b2bMemberCountNotionDashboard',
        timeoutMs: 45_000,
        maxAttempts: 3,
      });

      if (!result) {
        logger.warn(
          'B2B member count Notion dashboard sync skipped due to transient backend outage'
        );
        return;
      }

      logger.info('B2B member count Notion dashboard sync completed', { result: result.data });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      logger.error('B2B member count Notion dashboard sync failed', { error: normalized.message });
      throw normalized;
    }
  }
);
