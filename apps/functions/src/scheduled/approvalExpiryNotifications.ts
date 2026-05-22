/**
 * @fileoverview Approval Expiry Notifications — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/approvalExpiryNotifications
 *
 * Runs every minute to detect pending Agent X approvals that will expire
 * within 5 minutes and dispatches a push notification to the user.
 *
 * At-most-once delivery is guaranteed by the backend via the `expiryPushSent`
 * flag written to Firestore after each successful push dispatch.
 *
 * Required secrets/params (Firebase Secret Manager / .env.local):
 *   - CRON_SECRET: Shared secret between this function and the backend
 *   - BACKEND_URL: Base URL of the backend API (e.g. https://api.nxt1.com)
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { postBackendCronJson } from './utils/backendCronRequest';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

/**
 * Every-minute sweep for pending approvals within the 5-minute expiry window.
 * Calls the backend endpoint which performs the Firestore query and dispatches
 * pushes so the function itself remains lightweight and stateless.
 */
export const approvalExpiryNotifications = onSchedule(
  {
    schedule: '* * * * *',
    timeZone: 'America/New_York',
    retryCount: 0, // At-most-once — idempotency is enforced by the backend flag
    timeoutSeconds: 60,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting approval expiry notification sweep');

    try {
      const result = await postBackendCronJson<{ data?: { notified: number } }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/agent-x/cron/approval-expiry-notifications',
        cronSecret: CRON_SECRET.value(),
        jobName: 'approvalExpiryNotifications',
        timeoutMs: 15_000,
        maxAttempts: 2,
      });

      if (!result) {
        logger.warn('Approval expiry notification sweep skipped due to transient backend outage');
        return;
      }

      if ((result.data.data?.notified ?? 0) > 0) {
        logger.info('Approval expiry notifications dispatched', { result: result.data.data });
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Approval expiry notifications sweep failed', { error: error.message });
      throw error;
    }
  }
);
