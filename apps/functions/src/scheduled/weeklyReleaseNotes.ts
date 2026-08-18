/**
 * @fileoverview Weekly Release Notes — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/weeklyReleaseNotes
 *
 * Runs every Monday at 8:00 AM ET and calls the backend cron endpoint that
 * publishes the latest release notes when the workspace version has advanced.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { postBackendCronJson } from './utils/backendCronRequest';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

export const weeklyReleaseNotes = onSchedule(
  {
    schedule: '0 8 * * 1',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting weekly release notes run');

    try {
      const result = await postBackendCronJson<{
        success?: boolean;
        status?: string;
        version?: string;
        noteId?: string;
        commitCount?: number;
        reason?: string;
      }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/system/release-notes/cron/generate',
        cronSecret: CRON_SECRET.value(),
        jobName: 'weeklyReleaseNotes',
        timeoutMs: 20_000,
        maxAttempts: 3,
      });

      if (!result) {
        logger.warn('Weekly release notes skipped due to transient backend outage');
        return;
      }

      logger.info('Weekly release notes completed', { result: result.data });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Weekly release notes failed', { error: error.message });
      throw error;
    }
  }
);
