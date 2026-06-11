/**
 * @fileoverview Weekly Playbooks — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/weeklyPlaybooks
 *
 * Runs every Monday at 8:00 AM ET and calls the backend cron endpoint that
 * generates weekly Agent X playbooks.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { postBackendCronJson } from './utils/backendCronRequest';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

export const weeklyPlaybooks = onSchedule(
  {
    schedule: '0 8 * * 1',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting weekly Agent X playbooks run');

    try {
      const result = await postBackendCronJson<{
        success?: boolean;
        message?: string;
        status?: string;
      }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/agent-x/cron/weekly-playbooks',
        cronSecret: CRON_SECRET.value(),
        jobName: 'weeklyPlaybooks',
        timeoutMs: 20_000,
        maxAttempts: 3,
      });

      if (!result) {
        logger.warn('Weekly Agent X playbooks skipped due to transient backend outage');
        return;
      }

      logger.info('Weekly Agent X playbooks completed', { result: result.data });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Weekly Agent X playbooks failed', { error: error.message });
      throw error;
    }
  }
);
