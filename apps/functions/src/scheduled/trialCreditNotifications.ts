/**
 * @fileoverview Trial Credit Notifications — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/trialCreditNotifications
 *
 * Runs daily and calls the backend billing cron endpoint that sends proactive
 * 7-day, 3-day, and expired trial-credit push/activity notifications.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { postBackendCronJson } from './utils/backendCronRequest';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

export const trialCreditNotifications = onSchedule(
  {
    schedule: '0 9 * * *',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 180,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting trial credit notification sweep');

    try {
      const result = await postBackendCronJson<{ data?: unknown }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/billing/cron/trial-credit-notifications',
        cronSecret: CRON_SECRET.value(),
        jobName: 'trialCreditNotifications',
        timeoutMs: 30_000,
        maxAttempts: 3,
      });

      if (!result) {
        logger.warn('Trial credit notification sweep skipped due to transient backend outage');
        return;
      }

      logger.info('Trial credit notification sweep completed', { result: result.data });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      logger.error('Trial credit notification sweep failed', { error: normalized.message });
      throw normalized;
    }
  }
);
