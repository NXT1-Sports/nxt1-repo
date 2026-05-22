/**
 * @fileoverview Cleanup Stale Wallet Holds — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/cleanupStaleWalletHolds
 *
 * Runs every 15 minutes and calls the backend billing cron endpoint that:
 *   1. Expires active wallet holds whose expiresAt has passed
 *   2. Falls back to legacy createdAt-based expiry for older hold documents
 *   3. Releases pending hold balance back to the owning wallet
 *
 * Required secrets/params:
 *   - CRON_SECRET: shared secret between this function and the backend
 *   - BACKEND_URL: base URL of the backend API
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { postBackendCronJson } from './utils/backendCronRequest';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

export const cleanupStaleWalletHolds = onSchedule(
  {
    schedule: '*/15 * * * *',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 120,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting stale wallet hold cleanup sweep');

    try {
      const result = await postBackendCronJson<{ data?: { expiredCount: number } }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/billing/cron/expire-stale-holds',
        cronSecret: CRON_SECRET.value(),
        jobName: 'cleanupStaleWalletHolds',
        timeoutMs: 20_000,
        maxAttempts: 3,
      });

      if (!result) {
        logger.warn('Stale wallet hold cleanup skipped due to transient backend outage');
        return;
      }

      logger.info('Stale wallet hold cleanup completed', { result: result.data.data });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Stale wallet hold cleanup failed', { error: error.message });
      throw error;
    }
  }
);
