/**
 * @fileoverview Cleanup Tmp Media — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/cleanupTmpMedia
 *
 * Runs daily at 4:30 AM Eastern (30 min after thread media cleanup).
 * Calls the backend's CRON endpoint to delete Firebase Storage files whose
 * path contains a /tmp/ segment and that were created more than 7 days ago.
 *
 * Why a cron instead of a GCS lifecycle rule:
 * GCS lifecycle rules only support static path prefixes — they cannot match
 * wildcard mid-path segments like Users/{uid}/threads/{threadId}/tmp/.
 * A server-side sweep is the correct approach for dynamic uid/threadId paths.
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
 * Delete expired tmp/ media files — 4:30 AM ET, every day.
 *
 * Makes an authenticated POST to the backend which then:
 *   1. Iterates all objects under Users/ with a /tmp/ path segment
 *   2. Deletes any file older than 7 days (timeCreated threshold)
 *   3. Returns a count of scanned and deleted files for observability
 */
export const cleanupTmpMedia = onSchedule(
  {
    schedule: '30 4 * * *',
    timeZone: 'America/New_York',
    retryCount: 2,
    timeoutSeconds: 540, // 9 minutes — may iterate large buckets
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting Agent X tmp media cleanup');

    const url = `${BACKEND_URL.value()}/api/v1/agent-x/cron/cleanup-tmp-media`;

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

      const result = (await response.json()) as {
        success: boolean;
        data?: { totalScanned: number; totalDeleted: number; ttlDays: number };
      };
      logger.info('Agent X tmp media cleanup completed', { result });
    } catch (error) {
      logger.error('Agent X tmp media cleanup failed', { error });
      throw error; // Re-throw so Cloud Scheduler retries
    }
  }
);
