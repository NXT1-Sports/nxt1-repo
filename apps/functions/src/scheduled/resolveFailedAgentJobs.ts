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
import { postBackendCronJson } from './utils/backendCronRequest';

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

    try {
      const result = await postBackendCronJson<{
        data?: {
          scanned: number;
          eligible: number;
          enqueued: number;
          resolved: number;
          failed: number;
          skipped: number;
        };
      }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/agent-x/cron/resolve-failed-jobs',
        cronSecret: CRON_SECRET.value(),
        jobName: 'resolveFailedAgentJobs',
        timeoutMs: 20_000,
        maxAttempts: 2,
      });

      if (!result) {
        logger.warn('Failed agent job resolver skipped due to transient backend outage');
        return;
      }

      logger.info('Failed agent job resolver completed', { result: result.data.data });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed agent job resolver failed', { error: error.message });
      throw error;
    }
  }
);
