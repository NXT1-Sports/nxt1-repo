/**
 * @fileoverview Scan Timeline Posts — Cloud Scheduler Entry Point (Nightly Safety Net)
 * @module @nxt1/functions/scheduled/scanTimelinePosts
 *
 * Runs daily at 3:30 AM Eastern (30 min after thread summarization).
 * Calls the backend's CRON endpoint to scan recent timeline posts for
 * agent-active users and extract durable facts into vector memory.
 *
 * This is the SAFETY NET — the primary trigger is event-driven via
 * `onPostCreated` → BullMQ debounced job. This cron catches any posts
 * that were missed (e.g. if the backend was temporarily down when a
 * post was published).
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
 * Scan timeline posts for agent-active users — 3:30 AM ET, every day.
 *
 * Makes an authenticated POST to the backend which then:
 *   1. Finds users with recent Agent X activity (last 7 days)
 *   2. Checks which of those users posted in the last 24 hours
 *   3. Scans each user's timeline posts via LLM extraction
 *   4. Stores extracted durable facts as vector memories
 */
export const scanTimelinePosts = onSchedule(
  {
    schedule: '30 3 * * *',
    timeZone: 'America/New_York',
    retryCount: 2,
    timeoutSeconds: 540, // 9 minutes — processing up to 10 users
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting nightly timeline post scan (safety net)');

    const url = `${BACKEND_URL.value()}/api/v1/agent-x/cron/scan-timeline-posts`;

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
      logger.info('Nightly timeline post scan completed', { result });
    } catch (error) {
      logger.error('Nightly timeline post scan failed', { error });
      throw error; // Re-throw so Cloud Scheduler retries
    }
  }
);
