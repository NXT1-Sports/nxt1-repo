/**
 * @fileoverview B2B Outbound Initial Send — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/b2bOutboundInitialSend
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { postBackendCronJson } from './utils/backendCronRequest';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

export const b2bOutboundInitialSend = onSchedule(
  {
    schedule: '0 8 * * *',
    timeZone: 'America/New_York',
    retryCount: 2,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting B2B outbound initial send job');

    try {
      const result = await postBackendCronJson<{ result?: unknown }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/marketing/cron/b2b-outbound-initial-send',
        cronSecret: CRON_SECRET.value(),
        jobName: 'b2bOutboundInitialSend',
        timeoutMs: 90_000,
        maxAttempts: 3,
        body: {
          limit: 250,
          dailyCap: 250,
        },
      });

      if (!result) {
        logger.warn('B2B outbound initial send skipped due to transient backend outage');
        return;
      }

      logger.info('B2B outbound initial send completed', { result: result.data });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      logger.error('B2B outbound initial send failed', { error: normalized.message });
      throw normalized;
    }
  }
);
