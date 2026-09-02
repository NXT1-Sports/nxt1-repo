/**
 * @fileoverview Weekly Release Notes — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/weeklyReleaseNotes
 *
 * Manual-only release notes mode.
 *
 * The scheduled publisher remains deployed under the same function name so a
 * normal deploy disables automation without requiring an immediate manual
 * cleanup of the existing Cloud Scheduler target.
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
    void BACKEND_URL.value();
    void CRON_SECRET.value();
    void postBackendCronJson;

    logger.info('Weekly release notes automation is disabled; release notes are now manual only');
  }
);
