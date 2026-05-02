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

    const url = `${BACKEND_URL.value()}/api/v1/agent-x/cron/approval-expiry-notifications`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cron-Secret': CRON_SECRET.value(),
        },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        logger.error('Approval expiry notifications backend call failed', {
          status: response.status,
          body: body.slice(0, 500),
        });
        throw new Error(`Backend returned ${response.status}`);
      }

      const result = (await response.json()) as { data?: { notified: number } };
      if ((result.data?.notified ?? 0) > 0) {
        logger.info('Approval expiry notifications dispatched', { result: result.data });
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Approval expiry notifications sweep failed', { error: error.message });
      throw error;
    }
  }
);
