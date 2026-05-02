/**
 * @fileoverview Reconcile Agent Job-Thread Links — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/reconcileAgentJobThreadLinks
 *
 * Runs every 6 hours to repair missing `AgentJobs.threadId` values using
 * MongoDB message linkage (`operationId -> threadId`).
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

export const reconcileAgentJobThreadLinks = onSchedule(
  {
    schedule: '0 */6 * * *',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 180,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting agent job-thread link reconciliation');

    const url = `${BACKEND_URL.value()}/api/v1/agent-x/cron/reconcile-job-thread-links`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': CRON_SECRET.value(),
        },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        logger.error('Agent job-thread link reconciliation backend call failed', {
          status: response.status,
          body: body.slice(0, 500),
        });
        throw new Error(`Backend returned ${response.status}`);
      }

      const result = (await response.json()) as { data?: Record<string, unknown> };
      logger.info('Agent job-thread link reconciliation completed', {
        result: result.data ?? null,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Agent job-thread link reconciliation failed', { error: error.message });
      throw error;
    }
  }
);
