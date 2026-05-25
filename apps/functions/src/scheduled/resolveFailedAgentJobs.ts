/**
 * @fileoverview Resolve Failed Agent Jobs — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/resolveFailedAgentJobs
 *
 * Runs periodically to replay retryable failed Agent X jobs as no-charge
 * recovery jobs. The backend resolver only targets known transient platform
 * failures and records the rerun result before any customer follow-up is sent.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

export const resolveFailedAgentJobs = onSchedule(
  {
    schedule: '*/30 * * * *',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 120,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting failed agent job resolver sweep');

    const url = `${BACKEND_URL.value()}/api/v1/agent-x/cron/resolve-failed-jobs`;

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
        logger.warn('Backend returned non-OK response', {
          status: response.status,
          body: body.slice(0, 500),
        });
        throw new Error(`Failed job resolver: backend returned ${response.status}`);
      }

      const result = (await response.json()) as {
        data?: {
          scanned: number;
          eligible: number;
          enqueued: number;
          resolved: number;
          failed: number;
          skipped: number;
        };
      };
      logger.info('Failed agent job resolver completed', { result: result.data });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed agent job resolver failed', { error: error.message });
      throw error;
    }
  }
);
