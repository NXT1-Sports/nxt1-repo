/**
 * @fileoverview Cleanup Stale Agent Jobs — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/cleanupStaleAgentJobs
 *
 * Runs every 15 minutes to mark queued Agent X jobs that have been stuck
 * for more than 100 minutes as failed. This handles the case where the
 * backend process crashed mid-flight and never wrote a terminal status.
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
 * Sweep for dead/stuck queued jobs every 15 minutes.
 *
 * Calls the backend /api/v1/agent-x/cron/cleanup-stale-jobs endpoint which:
 *   1. Queries agentJobs where status === 'queued' AND createdAt < now − 100 min
 *   2. Batch-updates matching docs to status 'failed'
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

    const url = `${BACKEND_URL.value()}/api/v1/agent-x/cron/cleanup-stale-jobs`;

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
        // Use warn (not error) so the scheduler wrapper doesn't create a
        // duplicate Error Reporting group — the outer catch logs the single
        // authoritative error entry.
        logger.warn('Backend returned non-OK response', {
          status: response.status,
          body: body.slice(0, 500),
        });
        throw new Error(`Stale job cleanup: backend returned ${response.status}`);
      }

      const result = (await response.json()) as {
        data?: { scanned: number; markedFailed: number };
      };
      logger.info('Stale agent job cleanup completed', { result: result.data });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Stale agent job cleanup failed', { error: error.message });
      throw error;
    }
  }
);
