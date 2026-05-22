/**
 * @fileoverview Daily Briefings — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/dailyBriefings
 *
 * Runs daily and calls the backend cron endpoint that generates Agent X
 * daily briefings for users with active goals.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { postBackendCronJson } from './utils/backendCronRequest';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

export const dailyBriefings = onSchedule(
  {
    schedule: '0 7 * * *',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting daily Agent X briefings run');

    try {
      const result = await postBackendCronJson<{ data?: unknown }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/agent-x/cron/daily-briefings',
        cronSecret: CRON_SECRET.value(),
        jobName: 'dailyBriefings',
        timeoutMs: 45_000,
        maxAttempts: 3,
      });

      if (!result) {
        logger.warn('Daily briefings run skipped due to transient backend outage');
        return;
      }

      logger.info('Daily Agent X briefings completed', { result: result.data });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Daily Agent X briefings failed', { error: error.message });
      throw error;
    }
  }
);
