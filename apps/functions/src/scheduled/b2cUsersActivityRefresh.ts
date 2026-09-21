/**
 * @fileoverview B2C Users Activity Refresh — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/b2cUsersActivityRefresh
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { postBackendCronJson } from './utils/backendCronRequest';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

export const b2cUsersActivityRefresh = onSchedule(
  {
    schedule: '0 5 * * *',
    timeZone: 'America/New_York',
    retryCount: 3,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting B2C Users activity refresh');

    try {
      const result = await postBackendCronJson<{ result?: unknown }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/marketing/cron/b2c-users-activity-refresh',
        cronSecret: CRON_SECRET.value(),
        jobName: 'b2cUsersActivityRefresh',
        timeoutMs: 45_000,
        maxAttempts: 3,
      });

      if (!result) {
        logger.warn('B2C Users activity refresh skipped due to transient backend outage');
        return;
      }

      logger.info('B2C Users activity refresh completed', { result: result.data });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      logger.error('B2C Users activity refresh failed', { error: normalized.message });
      throw normalized;
    }
  }
);
