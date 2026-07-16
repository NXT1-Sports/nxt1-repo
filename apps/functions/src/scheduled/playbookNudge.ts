/**
 * @fileoverview Playbook Nudge — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/playbookNudge
 *
 * Runs Wednesday + Saturday at 6:00 PM ET and calls the backend endpoint
 * that dispatches personalized Agent X playbook progress nudges.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { postBackendCronJson } from './utils/backendCronRequest';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

export const playbookNudge = onSchedule(
  {
    schedule: '0 18 * * 3,6',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting Agent X playbook nudge run');

    try {
      const result = await postBackendCronJson<{
        success?: boolean;
        message?: string;
        status?: string;
      }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/agent-x/cron/playbook-nudge',
        cronSecret: CRON_SECRET.value(),
        jobName: 'playbookNudge',
        timeoutMs: 20_000,
        maxAttempts: 3,
      });

      if (!result) {
        logger.warn('Agent X playbook nudge skipped due to transient backend outage');
        return;
      }

      logger.info('Agent X playbook nudge completed', { result: result.data });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Agent X playbook nudge failed', { error: error.message });
      throw error;
    }
  }
);
