/**
 * @fileoverview Marketing Outbox Drain — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/marketingOutbox
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { postBackendCronJson } from './utils/backendCronRequest';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

export const marketingOutbox = onSchedule(
  {
    schedule: '*/15 * * * *',
    timeZone: 'UTC',
    retryCount: 1,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting marketing outbox drain');

    try {
      const result = await postBackendCronJson<{ result?: unknown }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/marketing/cron/marketing-outbox',
        cronSecret: CRON_SECRET.value(),
        jobName: 'marketingOutbox',
        timeoutMs: 45_000,
        maxAttempts: 3,
      });

      if (!result) {
        logger.warn('Marketing outbox drain skipped due to transient backend outage');
        return;
      }

      logger.info('Marketing outbox drain completed', { result: result.data });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      logger.error('Marketing outbox drain failed', { error: normalized.message });
      throw normalized;
    }
  }
);
