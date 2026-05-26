/**
 * @fileoverview Smart Signup Drip — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/signupDrip
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { postBackendCronJson } from './utils/backendCronRequest';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

export const signupDrip = onSchedule(
  {
    schedule: '0 10 * * *',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting smart signup drip run');

    try {
      const result = await postBackendCronJson<{ result?: unknown }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/marketing/cron/signup-drip',
        cronSecret: CRON_SECRET.value(),
        jobName: 'signupDrip',
        timeoutMs: 45_000,
        maxAttempts: 3,
      });

      if (!result) {
        logger.warn('Smart signup drip run skipped due to transient backend outage');
        return;
      }

      logger.info('Smart signup drip completed', { result: result.data });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      logger.error('Smart signup drip failed', { error: normalized.message });
      throw normalized;
    }
  }
);
