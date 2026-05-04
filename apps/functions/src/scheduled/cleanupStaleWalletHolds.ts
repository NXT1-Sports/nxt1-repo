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

    const url = `${BACKEND_URL.value()}/api/v1/billing/cron/expire-stale-holds`;

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
        throw new Error(`Stale wallet hold cleanup: backend returned ${response.status}`);
      }

      const result = (await response.json()) as {
        data?: { expiredCount: number };
      };
      logger.info('Stale wallet hold cleanup completed', { result: result.data });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Stale wallet hold cleanup failed', { error: error.message });
      throw error;
    }
  }
);
