/**
 * @fileoverview Signup Notion Dashboard Sync — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/signupNotionDashboard
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { postBackendCronJson } from './utils/backendCronRequest';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

function resolveEndpointPath(): string {
  const configuredPath = process.env['SIGNUP_NOTION_DASHBOARD_CRON_PATH']?.trim();
  if (configuredPath) return configuredPath;

  return '/api/v1/marketing/cron/signup-notion-dashboard';
}

export const signupNotionDashboard = onSchedule(
  {
    schedule: '*/5 * * * *',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting signup Notion dashboard sync');

    try {
      const result = await postBackendCronJson<{ result?: unknown }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: resolveEndpointPath(),
        cronSecret: CRON_SECRET.value(),
        jobName: 'signupNotionDashboard',
        timeoutMs: 45_000,
        maxAttempts: 3,
      });

      if (!result) {
        logger.warn('Signup Notion dashboard sync skipped due to transient backend outage');
        return;
      }

      logger.info('Signup Notion dashboard sync completed', { result: result.data });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      logger.error('Signup Notion dashboard sync failed', { error: normalized.message });
      throw normalized;
    }
  }
);
