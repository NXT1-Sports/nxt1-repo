/**
 * @fileoverview Cleanup Thread Media — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/cleanupThreadMedia
 *
 * Runs daily at 4 AM Eastern (off-peak, after thread summarization at 3 AM).
 * Calls the backend's CRON endpoint to delete Firebase Storage media for
 * threads whose MongoDB TTL expiration is imminent.
 *
 * Why this exists:
 * MongoDB TTL index deletes are silent — no application-level trigger fires
 * when a thread document is removed. This pre-expiry sweep ensures that
 * staged media (images, videos, generated graphics) stored under
 * `users/{userId}/threads/{threadId}/media/` is cleaned up before the
 * owning thread document disappears.
 *
 * Required secrets (Firebase Secret Manager):
 *   - CRON_SECRET: Shared secret between this function and the backend
 *   - BACKEND_URL: Base URL of the backend API (e.g. https://api.nxt1.com)
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

/**
 * Clean up staged media for expiring Agent X threads — 4:00 AM ET, daily.
 *
 * Makes an authenticated POST to the backend which then:
 *   1. Queries threads with expiresAt <= now + 24h and mediaCleaned ≠ true
 *   2. Bulk-deletes Firebase Storage files under each thread's media prefix
 *   3. Marks threads as mediaCleaned: true to prevent re-processing
 */
export const cleanupThreadMedia = onSchedule(
  {
    schedule: '0 4 * * *',
    timeZone: 'America/New_York',
    retryCount: 2,
    timeoutSeconds: 540, // 9 minutes — batch processing up to 100 threads
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting Agent X thread media cleanup');

    const url = `${BACKEND_URL.value()}/api/v1/agent-x/cron/cleanup-thread-media`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': CRON_SECRET.value(),
        },
      });

      if (!response.ok) {
        const body = await response.text();
        logger.error('Backend returned error', {
          status: response.status,
          body: body.slice(0, 500),
        });
        throw new Error(`Backend responded with ${response.status}`);
      }

      const result = await response.json();
      logger.info('Agent X thread media cleanup completed', { result });
    } catch (error) {
      logger.error('Agent X thread media cleanup failed', { error });
      throw error; // Re-throw so Cloud Scheduler retries
    }
  }
);
