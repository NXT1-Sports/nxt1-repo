/**
 * @fileoverview Cleanup Stale Agent Jobs — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/cleanupStaleAgentJobs
 *
 * Runs every 15 minutes to retire stale non-terminal Agent X jobs. Queued
 * jobs older than 100 minutes are marked failed, while long-lived yielded
 * jobs are auto-cancelled on separate thresholds depending on origin.
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
 * Sweep for dead/stuck non-terminal jobs every 15 minutes.
 *
 * Calls the backend /api/v1/agent-x/cron/cleanup-stale-jobs endpoint which:
 *   1. Marks queued jobs older than 100 minutes as failed
 *   2. Cancels yielded jobs older than 72 hours for system_cron origins
 *   3. Cancels yielded jobs older than 7 days for user origins
 *   4. Clears paused thread state for cancelled yielded jobs
 */
export const cleanupStaleAgentJobs = onSchedule(
  {
    schedule: '*/15 * * * *',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 120,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting stale agent job cleanup sweep');

    try {
      const result = await postBackendCronJson<{
        data?: {
          scanned: number;
          markedFailed: number;
          cancelled: number;
          failedToUpdate: number;
        };
      }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/agent-x/cron/cleanup-stale-jobs',
        cronSecret: CRON_SECRET.value(),
        jobName: 'cleanupStaleAgentJobs',
        timeoutMs: 20_000,
        maxAttempts: 3,
      });

      if (!result) {
        logger.warn('Stale agent job cleanup skipped due to transient backend outage');
        return;
      }

      logger.info('Stale agent job cleanup completed', { result: result.data.data });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Stale agent job cleanup failed', { error: error.message });
      throw error;
    }
  }
);
