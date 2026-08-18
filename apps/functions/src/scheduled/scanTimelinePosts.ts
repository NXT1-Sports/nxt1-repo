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
import { postBackendCronJson } from './utils/backendCronRequest';
import { sendScheduledSlackAlert } from './utils/slackAlert';

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

    try {
      const result = await postBackendCronJson({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/agent-x/cron/scan-timeline-posts',
        cronSecret: CRON_SECRET.value(),
        jobName: 'scanTimelinePosts',
        // Backend responds immediately and scans in the background; this only
        // needs to cover cold starts and transient gateway delays.
        timeoutMs: 15_000,
        maxAttempts: 3,
      });

      if (result === null) {
        logger.warn('scanTimelinePosts: backend unavailable after retries — skipping run');
        await sendScheduledSlackAlert({
          title: 'Timeline Post Scan Backend Unavailable',
          summary:
            'The nightly timeline post scan function could not hand off work to the backend after retrying.',
          route: '/api/v1/agent-x/cron/scan-timeline-posts',
          error: 'Backend unavailable after retries',
        });
        return;
      }

      logger.info('Nightly timeline post scan accepted by backend', { result: result.data });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      logger.error('Nightly timeline post scan failed', { error: normalized.message });
      await sendScheduledSlackAlert({
        title: 'Timeline Post Scan Request Failed',
        summary:
          'The nightly timeline post scan function failed before the backend accepted the request.',
        route: '/api/v1/agent-x/cron/scan-timeline-posts',
        error: normalized.message,
      });
      throw normalized;
    }
  }
);
